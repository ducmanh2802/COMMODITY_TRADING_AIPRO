/**
 * T101 - Web Push (VAPID) and email (SMTP) senders. Both are opt-in via env and null when unconfigured.
 * Keys / passwords are read from env only and never logged or put in errors.
 */
import nodemailer from 'nodemailer';
import { sendNotification } from 'web-push';
import type { ChannelStore, PushSubscriptionJson } from './channelStore.ts';

export type Env = Record<string, string | undefined>;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}
export function getVapid(env: Env = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com' };
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  /** Public origin used to build confirm / unsubscribe links (never taken from the request Host header). */
  baseUrl: string;
}
export function getSmtp(env: Env = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  const base = env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  if (!host || !from || !base || !/^https?:\/\//.test(base)) return null;
  const port = Number(env.SMTP_PORT) || 587;
  return { host, port, user: env.SMTP_USER?.trim() || null, pass: env.SMTP_PASS ?? null, from, baseUrl: base };
}

export type PushResult = 'ok' | 'gone' | 'error';
export interface PushSender {
  send(sub: PushSubscriptionJson, payload: { title: string; body: string; url?: string }): Promise<PushResult>;
}
export interface EmailSender {
  send(msg: { to: string; subject: string; text: string }): Promise<boolean>;
}

export function createPushSender(cfg: VapidConfig): PushSender {
  return {
    async send(sub, payload) {
      try {
        await sendNotification(sub, JSON.stringify(payload), {
          TTL: 3600,
          vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
        });
        return 'ok';
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        return code === 404 || code === 410 ? 'gone' : 'error';
      }
    },
  };
}

export function createEmailSender(cfg: SmtpConfig): EmailSender {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? '' } : undefined,
  });
  return {
    async send(m) {
      try {
        await transport.sendMail({ from: cfg.from, to: m.to, subject: m.subject, text: m.text });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export interface Channels {
  store: ChannelStore;
  vapidPublicKey: string | null;
  push: PushSender | null;
  email: EmailSender | null;
  baseUrl: string | null;
}
