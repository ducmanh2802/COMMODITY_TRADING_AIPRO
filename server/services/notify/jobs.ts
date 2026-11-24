/** T67 - scheduled checks that push zone / radar notifications to linked Telegram chats. Uses the SAME pure logic as the client. */
import type { RadarResponse } from '../../../src/shared/types/radar.ts';
import { diffRadar, type RadarSnapshot } from '../../../src/shared/radar/notify.ts';
import { describeZone, evaluateZone, type WatchZone } from '../../../src/shared/watchlist/watchlist.ts';
import type { Messenger } from './telegram.ts';
import type { NotifyStore } from './store.ts';

export const DISCLAIMER_RADAR = 'Chỉ mô tả dữ liệu giá đã đóng cửa, để nghiên cứu. Không phải khuyến nghị.';

export function zoneText(zone: WatchZone): string {
  const d = describeZone(zone, (n) => String(Number(n.toFixed(4))));
  return d.kind === 'range' ? d.text : d.kind === 'up' ? `chạm/vượt lên ${d.text}` : `chạm/xuống dưới ${d.text}`;
}

export function zoneMessage(symbol: string, zone: WatchZone): string {
  return `⚠ Giá ${symbol} đã vào vùng bạn đặt (${zoneText(zone)}) — theo giá trễ/giá đóng cửa, không phải giá thời gian thực. Chỉ để theo dõi, không phải khuyến nghị.`;
}

export interface ZoneJobDeps {
  store: NotifyStore;
  messenger: Messenger;
  /** Latest known (delayed / closing) price for an exchange symbol, null when unknown. */
  getPrice: (symbol: string) => Promise<number | null>;
}

/** Returns the number of alerts sent. The first observation of a zone is a silent baseline (see evaluateZone). */
export async function runZoneCheck(d: ZoneJobDeps): Promise<number> {
  let sent = 0;
  const prices = new Map<string, number | null>();
  for (const { chatId, prefs } of d.store.listActiveChats()) {
    if (!prefs.enabled) continue;
    for (const z of d.store.listZones(chatId)) {
      if (!prices.has(z.symbol)) {
        try {
          prices.set(z.symbol, await d.getPrice(z.symbol));
        } catch {
          prices.set(z.symbol, null);
        }
      }
      const price = prices.get(z.symbol);
      if (price === null || price === undefined) continue;
      const ev = evaluateZone(z.inZone, price, z.zone);
      if (ev.entered) {
        const r = await d.messenger.sendMessage(chatId, zoneMessage(z.symbol, z.zone));
        if (!r.ok) continue; // keep old state so the next run retries
        sent++;
      }
      if (ev.inZone !== z.inZone) d.store.setZoneState(chatId, z.symbol, ev.inZone);
    }
  }
  return sent;
}

export interface RadarJobDeps {
  store: NotifyStore;
  messenger: Messenger;
  getRadar: () => Promise<RadarResponse>;
}

/** Sends NEW radar events (top-list entries, breakouts) to chats with radar enabled. First run per chat = baseline. */
export async function runRadarCheck(d: RadarJobDeps): Promise<number> {
  const chats = d.store.listActiveChats().filter((c) => c.prefs.radar);
  if (chats.length === 0) return 0;
  const radar = await d.getRadar();
  let sent = 0;
  for (const { chatId } of chats) {
    const raw = d.store.getRadarSnapshot(chatId);
    let prev: RadarSnapshot | null = null;
    try {
      prev = raw ? (JSON.parse(raw) as RadarSnapshot) : null;
    } catch {
      prev = null;
    }
    const { notes, next } = diffRadar(prev, radar.items);
    let allOk = true;
    for (const n of notes.slice(0, 5)) {
      const r = await d.messenger.sendMessage(chatId, `📡 ${n.text}. ${DISCLAIMER_RADAR}`);
      if (r.ok) sent++;
      else allOk = false;
    }
    if (allOk) d.store.setRadarSnapshot(chatId, JSON.stringify(next));
  }
  return sent;
}
