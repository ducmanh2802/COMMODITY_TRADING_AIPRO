import { useT } from '../../../i18n';
import { MacroDataPanel } from '../../common/MacroDataPanel';
import { MacroRecordCards } from '../../common/MacroRecordCards';
import { FeedHeader } from './FeedHeader';
import { RecordForm } from './RecordForm';
import { useFundamentalNews } from './useFundamentalNews';

/** Fundamental / macro: sourced EIA/WASDE/DXY/USD-VND panel + macro records + manual entry. */
export function MacroPanel() {
  const t = useT();
  const { records, status, loading, refetch } = useFundamentalNews();

  return (
    <div className="space-y-6">
      <FeedHeader title={t('news.title.fundamental')} status={status} onSynced={refetch} />
      <MacroDataPanel />
      <RecordForm initialKind="MACRO" onSaved={refetch} />
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('news.macro.title', { n: records.length })}</h2>
        </div>
        {loading ? (
          <div className="p-6 text-xs font-mono text-[var(--text)]/60">{t('news.macro.loading')}</div>
        ) : records.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[var(--warning)]">{t('news.macro.empty')}</div>
        ) : (
          <MacroRecordCards records={records} />
        )}
      </section>
    </div>
  );
}
