/** Minimal RSS 2.0 parser (title, link, pubDate, source, description). Pure. */
export interface RssItem {
  title: string;
  link: string;
  publishedAt: string;
  source: string;
  snippet: string;
}

const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
const ENT_RE = /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(ENT_RE, (m) => ENT[m] ?? m)
    .replace(/<[^>]+>/g, ' ')
    .replace(ENT_RE, (m) => ENT[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? decode(m[1]) : '';
}

export function parseRss(xml: string, fallbackSource = ''): RssItem[] {
  const out: RssItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const title = tag(block, 'title');
    const link = tag(block, 'link');
    const ms = Date.parse(tag(block, 'pubDate'));
    if (!title || !/^https?:\/\//i.test(link) || Number.isNaN(ms)) continue;
    const source = tag(block, 'source') || fallbackSource;
    let snippet = tag(block, 'description');
    if (snippet === title || snippet.startsWith(title)) snippet = '';
    out.push({ title, link, publishedAt: new Date(ms).toISOString(), source, snippet: snippet.slice(0, 400) });
  }
  return out;
}
