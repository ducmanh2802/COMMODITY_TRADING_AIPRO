/** T101 - zone / radar checks that notify Web Push subscriptions and confirmed email subscribers (same logic and wording as Telegram). */
import type { RadarResponse } from '../../../src/shared/types/radar.ts';
import { diffRadar, type RadarSnapshot } from '../../../src/shared/radar/notify.ts';
import { evaluateZone } from '../../../src/shared/watchlist/watchlist.ts';
import { maskEmail, type ChannelStore } from './channelStore.ts';
import type { EmailSender, PushSender } from './channels.ts';
import { DISCLAIMER_RADAR, zoneMessage } from './jobs.ts';

export interface ChannelJobDeps {
  store: ChannelStore;
  push: PushSender | null;
  email: EmailSender | null;
  baseUrl: string | null;
  getPrice: (symbol: string) => Promise<number | null>;
  now?: () => number;
  /** Never receives addresses or endpoints in clear. */
  log?: (line: string) => void;
}

export const PUSH_TITLE = 'Commodity Trading AI Pro';

export function emailFooter(baseUrl: string, unsubToken: string): string {
  return `\n\n--\nHủy nhận email: ${baseUrl}/api/notify/email/unsubscribe?token=${unsubToken}`;
}

/** Returns the number of notifications sent (push + email). First observation of a zone is a silent baseline. */
export async function runChannelZoneCheck(d: ChannelJobDeps): Promise<number> {
  let sent = 0;
  const now = (d.now ?? Date.now)();
  const prices = new Map<string, number | null>();
  const priceOf = async (symbol: string): Promise<number | null> => {
    if (!prices.has(symbol)) {
      try {
        prices.set(symbol, await d.getPrice(symbol));
      } catch {
        prices.set(symbol, null);
      }
    }
    return prices.get(symbol) ?? null;
  };

  if (d.push) {
    for (const { sub } of d.store.listPush()) {
      for (const z of d.store.listPushZones(sub.endpoint)) {
        const price = await priceOf(z.symbol);
        if (price === null) continue;
        const ev = evaluateZone(z.inZone, price, z.zone);
        if (ev.entered) {
          const r = await d.push.send(sub, { title: PUSH_TITLE, body: zoneMessage(z.symbol, z.zone), url: '/' });
          if (r === 'gone') {
            d.store.removePush(sub.endpoint);
            d.log?.('push: expired subscription removed');
            break;
          }
          if (r === 'error') continue; // keep old state so the next run retries
          sent++;
        }
        if (ev.inZone !== z.inZone) d.store.setPushZoneState(sub.endpoint, z.symbol, ev.inZone);
      }
    }
  }

  if (d.email && d.baseUrl) {
    for (const { email, unsubToken } of d.store.listConfirmedEmails()) {
      for (const z of d.store.listEmailZones(email)) {
        const price = await priceOf(z.symbol);
        if (price === null) continue;
        const ev = evaluateZone(z.inZone, price, z.zone);
        if (ev.entered) {
          if (d.store.reserveEmail(email, now)) {
            const ok = await d.email.send({
              to: email,
              subject: `Giá ${z.symbol} đã vào vùng bạn đặt`,
              text: zoneMessage(z.symbol, z.zone) + emailFooter(d.baseUrl, unsubToken),
              headers: {
                'List-Unsubscribe': `<${d.baseUrl}/api/notify/email/unsubscribe?token=${unsubToken}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            });
            if (!ok) {
              d.log?.(`email: send failed for ${maskEmail(email)}`);
              continue; // keep old state, retry next run
            }
            sent++;
          } else {
            d.log?.(`email: daily cap reached for ${maskEmail(email)}`); // event dropped, state still advances
          }
        }
        if (ev.inZone !== z.inZone) d.store.setEmailZoneState(email, z.symbol, ev.inZone);
      }
    }
  }
  return sent;
}

export interface ChannelRadarDeps {
  store: ChannelStore;
  push: PushSender | null;
  getRadar: () => Promise<RadarResponse>;
}

/** New radar events to push subscribers that opted into radar. */
export async function runChannelRadarCheck(d: ChannelRadarDeps): Promise<number> {
  if (!d.push) return 0;
  const subs = d.store.listPush().filter((s) => s.radar);
  if (subs.length === 0) return 0;
  const radar = await d.getRadar();
  let sent = 0;
  for (const { sub } of subs) {
    const raw = d.store.getPushRadar(sub.endpoint);
    let prev: RadarSnapshot | null = null;
    try {
      prev = raw ? (JSON.parse(raw) as RadarSnapshot) : null;
    } catch {
      prev = null;
    }
    const { notes, next } = diffRadar(prev, radar.items);
    let allOk = true;
    for (const n of notes.slice(0, 5)) {
      const r = await d.push.send(sub, { title: PUSH_TITLE, body: `📡 ${n.text}. ${DISCLAIMER_RADAR}`, url: '/' });
      if (r === 'gone') {
        d.store.removePush(sub.endpoint);
        allOk = false;
        break;
      }
      if (r === 'ok') sent++;
      else allOk = false;
    }
    if (allOk) d.store.setPushRadar(sub.endpoint, JSON.stringify(next));
  }
  return sent;
}
