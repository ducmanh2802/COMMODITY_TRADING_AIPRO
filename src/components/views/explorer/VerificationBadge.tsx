import { CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react';

export type VerificationLevel = 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE';

const META: Record<VerificationLevel, { colorClass: string; Icon: typeof CheckCircle2 }> = {
  VERIFIED: { colorClass: 'text-[#22C55E] border-[#22C55E]/30 bg-[#22C55E]/10', Icon: CheckCircle2 },
  UNVERIFIED: { colorClass: 'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10', Icon: HelpCircle },
  UNAVAILABLE: { colorClass: 'text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10', Icon: ShieldAlert },
};

export function VerificationBadge({ status, title }: { status: VerificationLevel; title?: string }) {
  const meta = META[status] ?? META.UNAVAILABLE;
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[11px] font-medium whitespace-nowrap ${meta.colorClass}`}
      title={title ?? `Verification status: ${status}`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      {status}
    </span>
  );
}

/** Renders an external source as a link only when it is an http(s) URL. */
export function SourceLink({ href, label }: { href: string | null | undefined; label?: string }) {
  if (!href) return <span className="text-[#E5E7EB]/40 font-mono">NO_SOURCE</span>;
  if (!/^https?:\/\//i.test(href)) return <span className="text-[#E5E7EB]/70 break-all">{href}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#818CF8] hover:text-white underline underline-offset-2 break-all"
    >
      {label ?? href}
    </a>
  );
}
