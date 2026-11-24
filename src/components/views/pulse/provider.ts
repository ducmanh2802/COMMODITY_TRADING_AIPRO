/**
 * Provider name of a long provenance string.
 * "Yahoo Finance chart API (UNOFFICIAL, …) API sync …" -> "Yahoo Finance chart API"; "FRED — St. Louis Fed" -> "FRED".
 */
export function providerOf(src: string): string {
  return src.split(/\s*\(|\s+API sync|\s+[—-]\s+/)[0].trim() || src;
}
