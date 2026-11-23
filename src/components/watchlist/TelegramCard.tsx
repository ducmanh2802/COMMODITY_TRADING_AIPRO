import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useWatchlist } from './watchlistStore';

const KEY = 'ctap.tgLink';
interface Status {
  configured: boolean;
  bot: string | null;
  linked: boolean;
  enabled: boolean;
  radar: boolean;
}

function readCode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeCode(v: string | null): void {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
const post = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Optional Telegram notifications (off unless the server has TELEGRAM_BOT_TOKEN). Informational only. */
export function TelegramCard() {
  const t = useT();
  const { items } = useWatchlist();
  const [code, setCode] = useState<string | null>(readCode);
  const [st, setSt] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [radar, setRadar] = useState(false);
  const [sync, setSync] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/notify/telegram/status', { headers: code ? { 'x-link-code': code } : {} });
      const s = (await r.json()) as Status;
      setSt(s);
      setSync(s.enabled);
      setRadar(s.radar);
    } catch {
      setMsg(t('tg.error'));
    }
  }, [code, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!code || !st?.configured || st.linked) return;
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [code, st, refresh]);

  const pushSync = useCallback(
    async (enabled: boolean, rad: boolean) => {
      if (!code) return;
      await post('/api/notify/watchlist', {
        linkCode: code,
        enabled,
        radar: rad,
        items: items.map((i) => ({ instrumentId: i.instrumentId, zone: i.zone })),
      }).catch(() => undefined);
    },
    [code, items],
  );

  // Re-sync (debounced) when the watchlist changes while sync is on.
  useEffect(() => {
    if (st?.linked && (sync || radar)) {
      const id = setTimeout(() => void pushSync(sync, radar), 800);
      return () => clearTimeout(id);
    }
  }, [st?.linked, sync, radar, pushSync]);

  if (!st) return null;
  const box = 'bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 space-y-2 text-sm text-[var(--text)]';
  if (!st.configured) {
    return (
      <section className={box}>
        <h3 className="font-semibold text-[var(--text-strong)]">{t('tg.title')}</h3>
        <p className="text-xs text-[var(--muted)]">{t('tg.off')}</p>
      </section>
    );
  }
  const btn = 'min-h-[36px] px-3 rounded-lg border border-[var(--border)] text-[var(--text-strong)]';
  const getCode = async () => {
    try {
      const r = await post('/api/notify/telegram/link-code', {});
      const j = (await r.json()) as { linkCode?: string };
      if (j.linkCode) {
        writeCode(j.linkCode);
        setCode(j.linkCode);
      }
    } catch {
      setMsg(t('tg.error'));
    }
  };
  const sendTest = async () => {
    try {
      const r = await post('/api/notify/telegram/test', { linkCode: code });
      setMsg(t(r.ok ? 'tg.testOk' : 'tg.testFail'));
    } catch {
      setMsg(t('tg.error'));
    }
  };
  const unlink = async () => {
    await post('/api/notify/telegram/unlink', { linkCode: code }).catch(() => undefined);
    writeCode(null);
    setCode(null);
    setSync(false);
    setRadar(false);
    void refresh();
  };
  return (
    <section className={box}>
      <h3 className="font-semibold text-[var(--text-strong)]">{t('tg.title')}</h3>
      <p className="text-xs text-[var(--muted)]">{t('tg.intro')}</p>
      {!st.linked ? (
        <div className="space-y-2">
          {!code ? (
            <button type="button" className={btn} onClick={() => void getCode()}>
              {t('tg.getCode')}
            </button>
          ) : (
            <>
              <p>{t('tg.step', { code })}</p>
              {st.bot && (
                <a className="underline" href={`https://t.me/${st.bot}?start=${code}`} target="_blank" rel="noreferrer">
                  {t('tg.openBot')}
                </a>
              )}
              <p className="text-xs text-[var(--muted)]">{t('tg.waiting')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p>{t('tg.linked')}</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sync}
              onChange={(e) => {
                setSync(e.target.checked);
                void pushSync(e.target.checked, radar);
              }}
            />
            {t('tg.sync')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={radar}
              onChange={(e) => {
                setRadar(e.target.checked);
                void pushSync(sync, e.target.checked);
              }}
            />
            {t('tg.radar')}
          </label>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => void sendTest()}>
              {t('tg.test')}
            </button>
            <button type="button" className={btn} onClick={() => void unlink()}>
              {t('tg.unlink')}
            </button>
          </div>
          <p className="text-[11px] text-[var(--muted)]">{t('tg.delayed')}</p>
        </div>
      )}
      {msg && (
        <p role="status" className="text-xs text-[var(--muted)]">
          {msg}
        </p>
      )}
    </section>
  );
}
