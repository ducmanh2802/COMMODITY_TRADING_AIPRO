import { useEffect, useState } from 'react';
import { BellOff, Copy, RefreshCw } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { reportText } from '../../../shared/radar/notify';
import type { RadarItem, RadarSetup } from '../../../shared/types/radar';
import { refreshRadar, toggleMute, useRadar } from '../../radar/radarStore';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';
import { LineChart } from '../../ui/viz/LineChart';
import { useT } from '../../../i18n';

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function ScoreBar({ score }: { score: number }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${t('rd.scoreLabel')} ${score} trên 100`}>
      <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-[#F59E0B]" style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-white w-14 text-right">{score}/100</span>
    </div>
  );
}

function ItemCard({ item, rank, muted, onOpen }: { item: RadarItem; rank: number; muted: boolean; onOpen: () => void }) {
  const t = useT();
  const active = item.signals.filter((s) => s.active);
  const up = (item.changePct ?? 0) >= 0;
  return (
    <Card>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="text-left">
            <span className="text-xs text-[#E5E7EB]/50">{t('rd.rankPrefix').replace('{rank}', String(rank))}</span>
            <span className="text-base font-semibold text-white hover:underline">{item.name}</span>
            <span className="text-xs text-[#E5E7EB]/60"> {item.symbol} · {item.category}</span>
          </button>
          <button
            type="button"
            onClick={() => toggleMute(item.id)}
            aria-pressed={muted}
            title={muted ? t('rd.unmute') : t('rd.mute')}
            className={`shrink-0 inline-flex items-center gap-1 text-xs ${muted ? 'text-[#F59E0B]' : 'text-[#E5E7EB]/60 hover:text-white'}`}
          >
            <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
            {muted ? t('rd.muted') : t('rd.mute')}
          </button>
        </div>
        <ScoreBar score={item.score} />
        <div className="text-xs text-[#E5E7EB]/70 tabular-nums">
          Giá {fmt(item.lastClose)}
          {item.changePct !== null && (
            <span className={up ? 'text-[#34D399]' : 'text-[#F87171]'}>
              {up ? ` (+${fmt(item.changePct)}%)` : ` (${fmt(item.changePct)}%)`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {active.length === 0 && <span className="text-xs text-[#E5E7EB]/50">{t('rd.item.noSignals')}</span>}
          {active.map((s) => (
            <span key={s.id} title={s.reason ?? ''} className="px-2 py-0.5 rounded-full text-[11px] bg-[#3B82F6]/15 border border-[#3B82F6]/30 text-[#BFDBFE]">
              {s.label} +{s.points}
            </span>
          ))}
        </div>
        <LineChart points={item.spark.map((v, i) => ({ t: String(i), v }))} ariaLabel={`Giá 30 phiên gần nhất của ${item.name}`} height={64} formatValue={fmt} />
        <ul className="list-disc pl-4 text-sm text-[#E5E7EB] space-y-0.5">
          {item.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-[11px] text-[#E5E7EB]/50">
          Phiên {item.asOf} · nguồn {item.source ?? 'không rõ'}
          {item.quality ? ` (${item.quality})` : ''}
        </p>
      </div>
    </Card>
  );
}

function SetupCard({ s, onOpen }: { s: RadarSetup; onOpen: () => void }) {
  return (
    <Card>
      <div className="space-y-1.5">
        <button type="button" onClick={onOpen} className="text-left">
          <span className="text-base font-semibold text-white hover:underline">{s.name}</span>
          <span className="text-xs text-[#E5E7EB]/60"> {s.symbol}</span>
        </button>
        <p className="text-sm text-white">{s.description}</p>
        <ul className="list-disc pl-4 text-xs text-[#E5E7EB] space-y-0.5">
          {s.conditions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <ul className="list-disc pl-4 text-xs text-[#FCD34D] space-y-0.5">
          {s.risks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="text-[11px] text-[#E5E7EB]/50">Phiên {s.asOf} · nguồn {s.source ?? 'không rõ'}</p>
      </div>
    </Card>
  );
}

/** "Báo cáo thị trường hôm nay": ranked activity radar, setups worth studying, events, caveats. */
export function RadarView() {
  const t = useT();
  const radar = useRadar();
  const { openInstrumentIn } = useTerminal();
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!radar.data) void refreshRadar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const data = radar.data;

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(reportText(data));
      setCopied(t('rd.copied'));
    } catch {
      setCopied(t('rd.copyFail'));
    }
    window.setTimeout(() => setCopied(null), 4000);
  };

  if (!data) {
    return radar.error ? <EmptyState title={t('rd.error')} description={radar.error} /> : <Skeleton className="h-64 w-full" />;
  }
  const top = data.items.slice(0, 5);
  return (
    <div className="space-y-5">
      <SectionHeader
        title={t('rd.title')}
        subtitle={t('rd.subtitle').replace('{time}', data.asOf ?? 'không rõ').replace('{scored}', String(data.instrumentsScored)).replace('{total}', String(data.instrumentsTotal)) + (data.stale ? ` ${t('rd.stale')}` : '')}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-white/10 text-white hover:bg-white/5">
          <Copy className="w-3.5 h-3.5" aria-hidden="true" /> {t('rd.copyBtn')}
        </button>
        <button type="button" onClick={() => void refreshRadar()} disabled={radar.loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-white/10 text-white hover:bg-white/5 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${radar.loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('rd.refreshBtn')}
        </button>
        {copied && <span className="text-xs text-[#E5E7EB]/70">{copied}</span>}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">{t('rd.topTitle')}</h3>
        {top.length === 0 ? (
          <EmptyState title={t('rd.noTop')} description={t('rd.noTopDesc')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {top.map((i, idx) => (
              <ItemCard key={i.id} item={i} rank={idx + 1} muted={radar.settings.muted.includes(i.id)} onOpen={() => openInstrumentIn(i.symbol, 'instrument')} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">{t('rd.setupTitle')}</h3>
        <p className="text-xs text-[#E5E7EB]/60">{t('rd.setupNote')}</p>
        {data.setups.length === 0 ? (
          <p className="text-sm text-[#E5E7EB]/70">{t('rd.noSetups')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.setups.map((s) => (
              <SetupCard key={s.id} s={s} onOpen={() => openInstrumentIn(s.symbol, 'instrument')} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">{t('rd.eventsTitle')}</h3>
        {data.events.length === 0 ? (
          <p className="text-sm text-[#E5E7EB]/70">{t('rd.noEvents')}</p>
        ) : (
          <ul className="text-sm text-[#E5E7EB] space-y-0.5">
            {data.events.map((e) => (
              <li key={`${e.date}-${e.kind}`}>
                <span className="tabular-nums text-[#E5E7EB]/70">{e.date}</span> · {e.label} <span className="text-[11px] text-[#E5E7EB]/50">({e.source})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-white">{t('rd.caveatsTitle')}</h3>
        <ul className="list-disc pl-4 text-xs text-[#E5E7EB]/80 space-y-0.5">
          {data.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-[#E5E7EB]/60 border-t border-white/10 pt-3">{data.disclaimer}</p>
    </div>
  );
}
