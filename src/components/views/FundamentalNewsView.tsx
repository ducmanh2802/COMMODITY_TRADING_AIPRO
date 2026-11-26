import { MacroPanel } from './news/MacroPanel';
import { NewsFeed } from './news/NewsFeed';

interface FundamentalNewsViewProps {
  mode: 'fundamental' | 'news';
}

/** Thin wrapper kept for LegacyModule ids 'news' and 'fundamental'. */
export function FundamentalNewsView({ mode }: FundamentalNewsViewProps) {
  return mode === 'news' ? <NewsFeed /> : <MacroPanel />;
}
