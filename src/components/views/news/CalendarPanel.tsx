import { VietnamEconomicCalendar } from '../../common/VietnamEconomicCalendar';
import { useFundamentalNews } from './useFundamentalNews';

/** Economic calendar + trading sessions + holidays (macro records feed the release rows). */
export function CalendarPanel() {
  const { records } = useFundamentalNews();
  return <VietnamEconomicCalendar macroRecords={records} />;
}
