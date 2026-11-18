/**
 * Safe HTTP JSON reader that surfaces clear diagnostics when a reverse proxy or
 * restarting backend returns HTML (e.g. Cloud Run 502/503 during startup) instead
 * of throwing `Unexpected token '<', "<html>..." is not valid JSON`.
 */
export async function safeReadJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  const contentType = res.headers.get('content-type') ?? '';
  const looksLikeHtml = trimmed.startsWith('<') || contentType.includes('text/html');

  if (looksLikeHtml) {
    throw new Error(
      `Máy chủ đang khởi động lại hoặc cổng proxy trả về HTML (HTTP ${res.status}). Vui lòng thử lại sau vài giây.`
    );
  }

  let parsed: unknown = null;
  if (trimmed.length > 0) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Phản hồi không phải JSON hợp lệ (HTTP ${res.status}).`);
    }
  }

  if (!res.ok) {
    const msg =
      parsed && typeof parsed === 'object' && 'message' in parsed && typeof (parsed as { message?: unknown }).message === 'string'
        ? (parsed as { message: string }).message
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return parsed as T;
}
