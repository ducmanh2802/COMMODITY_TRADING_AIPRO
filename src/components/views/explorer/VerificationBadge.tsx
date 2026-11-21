import { CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react';
import { useT } from '../../../i18n';

export type VerificationLevel = 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE';

const META: Record<VerificationLevel, { colorClass: string; Icon: typeof CheckCircle2 }> = {
  VERIFIED: { colorClass: 'text-[var(--positive)] border-[var(--positive)]/30 bg-[var(--positive)]/10', Icon: CheckCircle2 },
  UNVERIFIED: { colorClass: 'text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10', Icon: HelpCircle },
  UNAVAILABLE: { colorClass: 'text-[var(--negative)] border-[var(--negative)]/30 bg-[var(--negative)]/10', Icon: ShieldAlert },
};

export function VerificationBadge({
  status,
  title,
  compact = false,
}: {
  status: VerificationLevel;
  title?: string;
  /** Compact: Vietnamese label only (code stays in the tooltip). */
  compact?: boolean;
}) {
  const t = useT();
  const level: VerificationLevel = META[status] ? status : 'UNAVAILABLE';
  const meta = META[level];
  const label = t(`verify.${level}`);
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[11px] font-medium whitespace-nowrap ${meta.colorClass}`}
      title={title ?? t('exp.verifyTitle', { code: status, label, desc: t(`verify.${level}.desc`) })}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      {compact || label === status ? label : `${label} (${status})`}
    </span>
  );
}

/** Renders an external source as a link only when it is an http(s) URL. */
export function SourceLink({ href, label }: { href: string | null | undefined; label?: string }) {
  const t = useT();
  if (!href) return <span className="text-[var(--text)]/40 font-mono">{t('verify.noSource')}</span>;
  if (!/^https?:\/\//i.test(href)) return <span className="text-[var(--text)]/70 break-all">{href}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--accent-text)] hover:text-[var(--text-strong)] underline underline-offset-2 break-all"
    >
      {label ?? href}
    </a>
  );
}
