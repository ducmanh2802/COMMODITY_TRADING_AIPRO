import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWatchlist } from './watchlistStore';

const box = 'bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 space-y-2 text-sm text-[var(--text)]';
const btn = 'min-h-[36px] px-3 rounded-lg border border-[var(--border)] text-[var(--text-strong)]';
const post = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function keyToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Web Push opt-in. Permission is only requested when the button is clicked. Informational only. */
function PushCard() {
  const t = useT();
  const { items } = useWatchlist();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [on, setOn] = useState(false);
  const [radar, setRadar] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const zones = useCallback(() => items.map((i) => ({ instrumentId: i.instrumentId, zone: i.zone })), [items]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch('/api/notify/push/key');
        if (alive) setConfigured(r.ok);
        if (r.ok && pushSupported()) {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (alive) setOn(!!sub && Notification.permission === 'granted');
        }
      } catch {
        if (alive) setConfigured(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sync = useCallback(
    async (rad: boolean) => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await post('/api/notify/push/subscribe', { subscription: sub.toJSON(), zones: zones(), radar: rad }).catch(() => undefined);
    },
    [zones],
  );

  // Re-sync (debounced) when the watchlist changes while push is on.
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => void sync(radar), 800);
    return () => clearTimeout(id);
  }, [on, radar, sync]);

  if (configured === null) return null;
  if (!configured)
    return (
      <section className={box}>
        <h3 className="font-semibold text-[var(--text-strong)]">{t('push.title')}</h3>
        <p className="text-xs text-[var(--muted)]">{t('push.off')}</p>
      </section>
    );
  const enable = async () => {
    setMsg(null);
    if (!pushSupported()) return setMsg(t('push.unsupported'));
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setMsg(t('push.denied'));
      const { publicKey } = (await (await fetch('/api/notify/push/key')).json()) as { publicKey: string };
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) as BufferSource }));
      const r = await post('/api/notify/push/subscribe', { subscription: sub.toJSON(), zones: zones(), radar });
      if (!r.ok) return setMsg(t('push.error'));
      setOn(true);
    } catch {
      setMsg(t('push.error'));
    }
  };
  const disable = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await post('/api/notify/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
    } catch {
      /* ignore */
    }
    setOn(false);
  };
  return (
    <section className={box}>
      <h3 className="font-semibold text-[var(--text-strong)]">{t('push.title')}</h3>
      <p className="text-xs text-[var(--muted)]">{t('push.intro')}</p>
      {on ? (
        <div className="space-y-2">
          <p>{t('push.on')}</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={radar} onChange={(e) => setRadar(e.target.checked)} />
            {t('push.radar')}
          </label>
          <button type="button" className={btn} onClick={() => void disable()}>
            {t('push.disable')}
          </button>
        </div>
      ) : (
        <button type="button" className={btn} onClick={() => void enable()}>
          {t('push.enable')}
        </button>
      )}
      <p className="text-[11px] text-[var(--muted)]">{t('push.delayed')}</p>
      {msg && (
        <p role="status" className="text-xs text-[var(--muted)]">
          {msg}
        </p>
      )}
    </section>
  );
}

/** Email opt-in with double confirmation (the server mails a confirm link). */
function EmailCard() {
  const t = useT();
  const { items } = useWatchlist();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/notify/email/status')
      .then((r) => r.json() as Promise<{ configured: boolean }>)
      .then((s) => alive && setConfigured(s.configured))
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
  }, []);

  if (configured === null) return null;
  if (!configured)
    return (
      <section className={box}>
        <h3 className="font-semibold text-[var(--text-strong)]">{t('email.title')}</h3>
        <p className="text-xs text-[var(--muted)]">{t('email.off')}</p>
      </section>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await post('/api/notify/email/subscribe', { email, zones: items.map((i) => ({ instrumentId: i.instrumentId, zone: i.zone })) });
      setMsg(t(r.ok ? 'email.sent' : r.status === 400 ? 'email.bad' : 'email.error'));
    } catch {
      setMsg(t('email.error'));
    }
  };
  return (
    <section className={box}>
      <h3 className="font-semibold text-[var(--text-strong)]">{t('email.title')}</h3>
      <p className="text-xs text-[var(--muted)]">{t('email.intro')}</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => void submit(e)}>
        <input
          type="email"
          required
          aria-label={t('email.label')}
          placeholder={t('email.placeholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-[36px] flex-1 min-w-[12rem] px-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"
        />
        <button type="submit" className={btn}>
          {t('email.submit')}
        </button>
      </form>
      {msg && (
        <p role="status" className="text-xs text-[var(--muted)]">
          {msg}
        </p>
      )}
    </section>
  );
}

export function PushEmailCards() {
  return (
    <>
      <PushCard />
      <EmailCard />
    </>
  );
}
