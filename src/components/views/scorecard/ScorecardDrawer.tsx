import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, Sparkles, X } from 'lucide-react';
import { fmtDate, useI18n, type TKey } from '../../../i18n';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { Scorecard, ScorecardNarrative } from '../../../shared/types/scorecard';
import { safeReadJson } from '../../../shared/utils/http';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { DimBadge, LEVEL_TONE } from './shared';

interface Props {
  card: Scorecard;
  onClose: () => void;
}

type AiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; narrative: ScorecardNarrative }
  | { kind: 'unavailable'; reason: string };

/** Detail drawer: overall readings, per-dimension explanations, on-demand AI summary, link to the brief. */
export function ScorecardDrawer({ card, onClose }: Props) {
  const { t, lang } = useI18n();
  const { setSelectedSymbol, setActiveModule } = useTerminal();
  const [ai, setAi] = useState<AiState>({ kind: 'idle' });
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = lang === 'vi' && card.vietnameseName ? card.vietnameseName : card.productName;

  useEffect(() => {
    setAi({ kind: 'idle' });
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card.instrumentId, onClose]);

  const reasonText = (code: string) => t(`sc.ai.reason.${code}` as TKey) === `sc.ai.reason.${code}` ? t('sc.ai.reason.UNKNOWN') : t(`sc.ai.reason.${code}` as TKey);

  const runAi = async () => {
    setAi({ kind: 'loading' });
    try {
      const res = await fetch(`/api/scorecard/${encodeURIComponent(card.instrumentId)}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      if (res.status === 429) {
        setAi({ kind: 'unavailable', reason: reasonText('RATE_LIMIT_EXCEEDED') });
        return;
      }
      const body = await safeReadJson<{ narrative?: ScorecardNarrative }>(res);
      if (!body.narrative) setAi({ kind: 'unavailable', reason: reasonText('UNKNOWN') });
      else setAi({ kind: 'ok', narrative: body.narrative });
    } catch {
      setAi({ kind: 'unavailable', reason: reasonText('UNKNOWN') });
    }
  };

  const used = card.overall.dimensionsUsed.map((d) => t(`sc.dim.${d}` as TKey)).join(', ') || '—';
  const excluded = card.overall.dimensionsExcluded.map((d) => t(`sc.dim.${d}` as TKey)).join(', ');
  const dq = card.dataQuality;
  const narrative = ai.kind === 'ok' ? ai.narrative : card.narrative;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('sc.detail.title')}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <aside className="relative w-full max-w-xl h-full overflow-y-auto bg-[var(--surface)] border-l border-[var(--border)] p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-strong)] truncate">{name}</h2>
            <p className="text-xs font-mono text-[var(--faint)]">{card.instrumentId}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('sc.detail.close')} className="p-1.5 min-w-10 min-h-10 inline-flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text-strong)]">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <Card tone="warning" className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{card.disclaimer[lang]}</span>
        </Card>

        <section aria-labelledby="sc-narr" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="sc-narr" className="text-sm font-semibold text-[var(--text-strong)]">{t('sc.narr.title')}</h3>
            {(card.aiProvider === 'gemini' || card.aiProvider === 'ollama') && (
              <button type="button" onClick={() => void runAi()} disabled={ai.kind === 'loading'} className="flex items-center gap-1.5 px-3 py-1.5 min-h-10 text-xs rounded-md bg-[var(--accent)] text-white disabled:opacity-60">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                {ai.kind === 'loading' ? t('sc.ai.loading') : t('sc.ai.button')}
              </button>
            )}
          </div>
          <div aria-live="polite" className="space-y-1">
            {ai.kind === 'unavailable' && <p className="text-xs text-[var(--muted)]">{t('sc.ai.unavailable', { reason: ai.reason })}</p>}
            {narrative ? (
              <>
                <p className="text-sm text-[var(--text)] leading-relaxed">{narrative[lang] || narrative.vi || narrative.en}</p>
                <p className="text-[11px] text-[var(--faint)]">{t('sc.narr.engine', { src: narrative.source[lang] })}</p>
                {narrative.fallbackFrom && <p className="text-[11px] text-[var(--faint)]">{t('sc.narr.fallback')}</p>}
              </>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="sc-overall" className="space-y-2">
          <h3 id="sc-overall" className="text-sm font-semibold text-[var(--text-strong)]">{t('sc.detail.overall')}</h3>
          {[card.overall.trendClarity, card.overall.volatilityRisk].map((o, i) => (
            <div key={i} className="rounded-md border border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-[var(--text-strong)]">{o.label[lang]}</span>
                {o.score !== null && <span className="text-sm tabular-nums text-[var(--accent-text)]">{o.score}/100</span>}
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{o.explanation[lang]}</p>
            </div>
          ))}
          <p className="text-[11px] text-[var(--faint)]">{t('sc.detail.used', { list: used })}</p>
          <p className="text-[11px] text-[var(--faint)]">{excluded ? t('sc.detail.excluded', { list: excluded }) : t('sc.detail.noneExcluded')}</p>
        </section>

        <section aria-labelledby="sc-dims" className="space-y-2">
          <h3 id="sc-dims" className="text-sm font-semibold text-[var(--text-strong)]">{t('sc.detail.dimensions')}</h3>
          {card.dimensions.map((d) => (
            <div key={d.id} className="rounded-md border border-[var(--border)] p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[var(--text-strong)]">{t(`sc.dim.${d.id}` as TKey)}</span>
                <DimBadge dim={d} />
              </div>
              <p className="text-xs text-[var(--text)]/85">{d.explanation[lang]}</p>
              {d.status === 'OK' && d.metrics.length > 0 && (
                <p className="text-[11px] font-mono text-[var(--faint)] break-words">
                  {d.metrics.filter((m) => m.value !== null).map((m) => `${m.key}=${typeof m.value === 'number' ? Number(m.value.toFixed(4)) : m.value}${m.unit ? ` ${m.unit}` : ''}`).join(' · ')}
                </p>
              )}
              <p className="text-[11px] text-[var(--faint)] break-words">
                {t('sc.detail.source')}: {d.source}{d.asOf ? ` · ${t('sc.detail.asOf')}: ${fmtDate(d.asOf)}` : ''}
              </p>
            </div>
          ))}
        </section>

        <section aria-labelledby="sc-dq" className="space-y-1">
          <h3 id="sc-dq" className="text-sm font-semibold text-[var(--text-strong)]">{t('sc.detail.dataQuality')} <Badge tone={LEVEL_TONE[dq.level]}>{dq.label[lang]}</Badge></h3>
          <p className="text-xs text-[var(--muted)] break-words">{t('sc.detail.quote', { status: dq.quoteStatus, src: dq.quoteSource })}</p>
          <p className="text-xs text-[var(--muted)] break-words">
            {dq.historyBars > 0
              ? t('sc.detail.history', { n: dq.historyBars, from: dq.historyFrom ? fmtDate(dq.historyFrom) : '—', to: dq.historyTo ? fmtDate(dq.historyTo) : '—', src: `${dq.historySource ?? '—'}${dq.historyQuality ? ` (${dq.historyQuality})` : ''}` })
              : t('sc.detail.historyNone')}
          </p>
        </section>

        <button
          type="button"
          onClick={() => {
            setSelectedSymbol(card.exchangeSymbol);
            setActiveModule('brief');
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
        >
          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
          {t('sc.detail.openBrief')}
        </button>
      </aside>
    </div>
  );
}
