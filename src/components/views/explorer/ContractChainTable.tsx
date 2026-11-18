import type { ChainContract } from '../../../shared/contracts/chain';
import type { ContractDateResult } from '../../../shared/contracts/expiry';
import type { ContractChainResponse } from '../../../api/contractsApi';
import { VerificationBadge } from './VerificationBadge';
import { fmtDate, useT } from '../../../i18n';

function DateCell({ r }: { r: ContractDateResult }) {
  const t = useT();
  if (r.status === 'COMPUTED') {
    return (
      <span className="font-mono tabular-nums text-white" title={r.date}>
        {fmtDate(r.date)}
      </span>
    );
  }
  return (
    <span className="font-mono text-[#F59E0B]" title={r.reason}>
      {t('exp.unavailable')}
    </span>
  );
}

function holidayFlag(c: ChainContract): string {
  const parts = [c.lastTradingDay, c.firstNoticeDay]
    .filter((r): r is Extract<ContractDateResult, { status: 'COMPUTED' }> => r.status === 'COMPUTED')
    .map((r) => r.holidayAdjusted);
  if (parts.length === 0) return 'n/a';
  return parts.every(Boolean) ? 'YES' : 'NO';
}

function rowWarnings(c: ChainContract): string[] {
  const out = [...c.warnings];
  for (const r of [c.lastTradingDay, c.firstNoticeDay]) {
    if (r.status === 'COMPUTED') out.push(...r.warnings);
    else out.push(r.reason);
  }
  return [...new Set(out)];
}

export function ContractChainTable({ chain }: { chain: ContractChainResponse }) {
  const t = useT();
  const flagLabel = (f: string) => (f === 'YES' ? t('exp.yes') : f === 'NO' ? t('exp.no') : t('exp.na'));
  if (chain.status !== 'OK') {
    return (
      <p className="text-xs font-mono text-[#F59E0B]" role="status">
        {t('exp.chain.unavailable', { reason: chain.reason })}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-[#263244] rounded-md">
        <table className="w-full text-left border-collapse min-w-[860px] text-xs">
          <thead>
            <tr className="border-b border-[#263244] bg-[#172033]/50 text-[#E5E7EB]/65">
              <th className="py-2 px-3 font-medium">{t('exp.chain.exchangeCode')}</th>
              <th className="py-2 px-3 font-medium">{t('exp.chain.mxvCode')}</th>
              <th className="py-2 px-3 font-medium">{t('exp.chain.month')}</th>
              <th className="py-2 px-3 font-medium">{t('term.lastTradingDay')}</th>
              <th className="py-2 px-3 font-medium">{t('term.firstNoticeDay')}</th>
              <th className="py-2 px-3 font-medium text-right" title={t('exp.chain.daysToLtdTitle')}>
                {t('exp.chain.daysToLtd')}
              </th>
              <th className="py-2 px-3 font-medium">{t('exp.chain.holidayAdjusted')}</th>
              <th className="py-2 px-3 font-medium">{t('exp.chain.calendar')}</th>
              <th className="py-2 px-3 font-medium">{t('exp.chain.warnings')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#263244]/70">
            {chain.contracts.map((c) => {
              const warns = rowWarnings(c);
              return (
                <tr key={c.code} className="hover:bg-[#172033]/40 align-top">
                  <td className="py-2 px-3 font-mono text-white whitespace-nowrap">{c.code}</td>
                  <td className="py-2 px-3 font-mono whitespace-nowrap">
                    {c.mxvCode ?? <span className="text-[#E5E7EB]/40">{t('exp.unavailable')}</span>}
                  </td>
                  <td className="py-2 px-3 font-mono text-[#E5E7EB]/75 whitespace-nowrap">{c.contractMonth}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <DateCell r={c.lastTradingDay} />
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <DateCell r={c.firstNoticeDay} />
                  </td>
                  <td className="py-2 px-3 font-mono tabular-nums text-right whitespace-nowrap">
                    {c.calendarDaysToLastTrade ?? <span className="text-[#E5E7EB]/40">{t('exp.na')}</span>}
                  </td>
                  <td className="py-2 px-3 font-mono whitespace-nowrap">
                    <span className={holidayFlag(c) === 'YES' ? 'text-[#22C55E]' : 'text-[#F59E0B]'}>{flagLabel(holidayFlag(c))}</span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <VerificationBadge status={c.calendarStatus} />
                  </td>
                  <td className="py-2 px-3 text-[11px] text-[#F59E0B]/85 max-w-[360px]">
                    {warns.length === 0 ? (
                      <span className="text-[#E5E7EB]/40">{t('exp.none')}</span>
                    ) : (
                      <ul className="list-disc pl-4 space-y-0.5">
                        {warns.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {chain.warnings.length > 0 && (
        <ul className="text-[11px] font-mono text-[#F59E0B]/85 list-disc pl-4 space-y-0.5">
          {chain.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-[#E5E7EB]/45">{chain.disclaimer}</p>
    </div>
  );
}
