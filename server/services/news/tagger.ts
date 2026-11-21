/**
 * T91 - pure news tagger: instrument ids (keyword/alias map, Vietnamese + English) and a coarse
 * impact label by rules. No I/O. Matching is accent-insensitive and word-boundary aware so short
 * aliases (e.g. "gas", "oil") do not match inside other words.
 */
export type NewsImpact = 'CAO' | 'TRUNG BÌNH' | 'THẤP';

/** Aliases per instrument id (all lowercase; accents are stripped before matching). */
export const INSTRUMENT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'CBOT:ZS': ['soybean', 'soybeans', 'soy', 'đậu tương', 'đậu nành'],
  'CBOT:ZM': ['soybean meal', 'soymeal', 'khô đậu tương', 'khô đậu nành', 'bột đậu tương'],
  'CBOT:ZL': ['soybean oil', 'soyoil', 'dầu đậu tương', 'dầu đậu nành'],
  'CBOT:ZC': ['corn', 'maize', 'ngô', 'bắp'],
  'CBOT:ZW': ['wheat', 'lúa mì', 'bột mì'],
  'CBOT:ZR': ['rough rice', 'paddy rice', 'thóc', 'lúa gạo', 'giá gạo', 'rice futures'],
  'ICE:KC': ['coffee', 'arabica', 'cà phê'],
  'ICE:RC': ['coffee', 'robusta', 'cà phê', 'cà phê robusta'],
  'ICE:SB': ['sugar', 'đường', 'ethanol mía'],
  'ICE:CC': ['cocoa', 'cacao', 'ca cao'],
  'ICE:CT': ['cotton', 'bông', 'sợi bông'],
  'COMEX:HG': ['copper', 'đồng'],
  'COMEX:GC': ['gold', 'vàng', 'bullion'],
  'COMEX:SI': ['silver', 'bạc'],
  'NYMEX:PL': ['platinum', 'bạch kim'],
  'CME:TIO': ['iron ore', 'quặng sắt'],
  'SGX:FEF': ['iron ore', 'quặng sắt'],
  'NYMEX:CL': ['crude', 'wti', 'west texas', 'opec', 'dầu thô', 'dầu mỏ', 'giá dầu', 'oil'],
  'ICE:BRN': ['brent', 'crude', 'opec', 'dầu thô', 'dầu mỏ', 'giá dầu', 'oil'],
  'NYMEX:NG': ['natural gas', 'khí đốt', 'khí tự nhiên', 'lng'],
};

const HIGH_RULES: readonly string[] = [
  'wasde', 'eia', 'opec', 'usda', 'fomc', 'frost', 'drought', 'tariff', 'embargo', 'sanction', 'strike',
  'export ban', 'crop report', 'acreage', 'stocks report', 'hurricane', 'el nino', 'la nina',
  'sương giá', 'hạn hán', 'thuế quan', 'cấm xuất khẩu', 'lệnh trừng phạt', 'báo cáo cung cầu', 'lũ lụt',
];
const MEDIUM_RULES: readonly string[] = [
  'inventory', 'inventories', 'stockpile', 'harvest', 'planting', 'forecast', 'supply', 'demand', 'export',
  'import', 'rate', 'inflation', 'dollar', 'china', 'brazil', 'weather', 'rain', 'output', 'production',
  'tồn kho', 'thu hoạch', 'xuất khẩu', 'nhập khẩu', 'sản lượng', 'thời tiết', 'lãi suất', 'lạm phát',
  'nguồn cung', 'nhu cầu',
];

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const wordRegexCache = new Map<string, RegExp>();
function hasTerm(haystackNorm: string, term: string): boolean {
  const n = normalizeText(term);
  let re = wordRegexCache.get(n);
  if (!re) {
    const esc = n.replace(/[.*+?^$(){}|[\]\\]/g, (c) => `\\${c}`);
    re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`);
    wordRegexCache.set(n, re);
  }
  return re.test(haystackNorm);
}

export function tagInstruments(text: string): string[] {
  const h = normalizeText(text);
  const out: string[] = [];
  for (const [id, aliases] of Object.entries(INSTRUMENT_ALIASES)) {
    if (aliases.some((a) => hasTerm(h, a))) out.push(id);
  }
  return out;
}

export function classifyImpact(text: string): NewsImpact {
  const h = normalizeText(text);
  if (HIGH_RULES.some((r) => hasTerm(h, r))) return 'CAO';
  if (MEDIUM_RULES.some((r) => hasTerm(h, r))) return 'TRUNG BÌNH';
  return 'THẤP';
}

export interface TaggedNews {
  instruments: string[];
  impact: NewsImpact;
}

export function tagNews(input: { title: string; snippet?: string; relatedSymbols?: readonly string[] }): TaggedNews {
  const text = `${input.title} ${input.snippet ?? ''}`;
  const set = new Set(tagInstruments(text));
  for (const s of input.relatedSymbols ?? []) {
    if (s in INSTRUMENT_ALIASES) set.add(s);
  }
  const instruments = [...set];
  return { instruments, impact: classifyImpact(text) };
}
