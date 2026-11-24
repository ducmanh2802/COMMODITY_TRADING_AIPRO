/**
 * T91 - NewsService: public Google News RSS (English + Vietnamese topic queries) merged with manually
 * sourced items, tagged by instrument + impact. Cached in memory, fail-closed (an unreachable feed
 * yields fewer items, never invented ones). Optional Vietnamese AI summary (Gemini, key from server env)
 * cached per item; without a key no summary is produced.
 */
import { parseRss, type RssItem } from './rss.ts';
import { tagNews, type NewsImpact } from './tagger.ts';

interface NewsItem {
  id: string;
  title: string;
  snippet: string;
  link: string | null;
  source: string;
  publishedAt: string;
  instruments: string[];
  impact: NewsImpact;
  /** Vietnamese auto-summary (AI) when configured; always null otherwise. */
  summaryVi: string | null;
}

export interface NewsResponse {
  retrievedAt: string;
  aiSummaries: boolean;
  items: NewsItem[];
}

export type FetchText = (url: string) => Promise<string>;
export type Summarizer = (item: { title: string; snippet: string }) => Promise<string | null>;

const FEEDS: { q: string; lang: 'en' | 'vi' }[] = [
  { q: 'corn OR soybeans OR wheat futures', lang: 'en' },
  { q: 'coffee OR cocoa OR sugar OR cotton futures', lang: 'en' },
  { q: 'crude oil OR Brent OR OPEC OR natural gas', lang: 'en' },
  { q: 'gold OR silver OR copper OR platinum price', lang: 'en' },
  { q: 'iron ore price', lang: 'en' },
  { q: 'giá cà phê OR giá ngô OR giá đậu tương', lang: 'vi' },
  { q: 'giá dầu OR giá vàng OR giá đồng', lang: 'vi' },
];

function feedUrl(f: { q: string; lang: 'en' | 'vi' }): string {
  const loc = f.lang === 'vi' ? 'hl=vi&gl=VN&ceid=VN:vi' : 'hl=en-US&gl=US&ceid=US:en';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${f.q} when:7d`)}&${loc}`;
}

const defaultFetch: FetchText = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'commodity-research-app' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

export interface ManualNews {
  id: string;
  headline: string;
  source: string;
  publicationTimestamp: string;
  relatedSymbols: string[];
  summary: string;
}

export interface NewsServiceDeps {
  fetchText?: FetchText;
  summarizer?: Summarizer | null;
  manual?: () => ManualNews[];
  ttlMs?: number;
  now?: () => number;
}

function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `n${(h >>> 0).toString(36)}`;
}

export class NewsService {
  private cache: { at: number; items: RssItem[] } | null = null;
  private readonly summaries = new Map<string, string | null>();
  private readonly fetchText: FetchText;
  private readonly ttl: number;
  private readonly now: () => number;

  constructor(private readonly deps: NewsServiceDeps = {}) {
    this.fetchText = deps.fetchText ?? defaultFetch;
    this.ttl = deps.ttlMs ?? 15 * 60_000;
    this.now = deps.now ?? Date.now;
  }

  private async loadFeeds(): Promise<RssItem[]> {
    if (this.cache && this.now() - this.cache.at < this.ttl) return this.cache.items;
    const settled = await Promise.allSettled(FEEDS.map(async (f) => parseRss(await this.fetchText(feedUrl(f)))));
    const seen = new Set<string>();
    const items: RssItem[] = [];
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      for (const it of r.value) {
        if (seen.has(it.link)) continue;
        seen.add(it.link);
        items.push(it);
      }
    }
    // Keep the previous cache if every feed failed.
    // An empty result (all feeds down / blocked / HTML) is cached for at most 60 s so recovery is quick.
    const emptyTtl = Math.min(this.ttl, 60_000);
    if (items.length === 0 && this.cache) {
      this.cache = { at: this.now() - (this.ttl - emptyTtl), items: this.cache.items }; // keep last good copy, retry soon
      return this.cache.items;
    }
    this.cache = { at: items.length === 0 ? this.now() - (this.ttl - emptyTtl) : this.now(), items };
    return items;
  }

  async getNews(opts: { instrument?: string; limit?: number } = {}): Promise<NewsResponse> {
    const feed = await this.loadFeeds().catch(() => [] as RssItem[]);
    const all: NewsItem[] = feed.map((it) => {
      const tg = tagNews({ title: it.title, snippet: it.snippet });
      return {
        id: hashId(it.link),
        title: it.title,
        snippet: it.snippet,
        link: it.link,
        source: it.source || 'Google News',
        publishedAt: it.publishedAt,
        instruments: tg.instruments,
        impact: tg.impact,
        summaryVi: null,
      };
    });
    for (const m of this.deps.manual?.() ?? []) {
      const tg = tagNews({ title: m.headline, snippet: m.summary, relatedSymbols: m.relatedSymbols });
      all.push({
        id: m.id,
        title: m.headline,
        snippet: m.summary,
        link: null,
        source: m.source,
        publishedAt: m.publicationTimestamp,
        instruments: tg.instruments,
        impact: tg.impact,
        summaryVi: null,
      });
    }
    const want = opts.instrument?.trim();
    let items = all.filter((n) => n.instruments.length > 0);
    if (want) items = items.filter((n) => n.instruments.some((i) => i === want || i.endsWith(`:${want}`)));
    items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    items = items.slice(0, Math.min(Math.max(opts.limit ?? 40, 1), 100));

    const summarizer = this.deps.summarizer ?? null;
    if (summarizer) {
      await Promise.all(
        items.map(async (n) => {
          if (!this.summaries.has(n.id)) {
            this.summaries.set(n.id, await summarizer({ title: n.title, snippet: n.snippet }).catch(() => null));
          }
          n.summaryVi = this.summaries.get(n.id) ?? null;
        })
      );
    }
    return { retrievedAt: new Date(this.now()).toISOString(), aiSummaries: summarizer !== null, items };
  }
}
