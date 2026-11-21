import { createGeminiModelClient } from '../aiAnalyst.ts';
import type { Summarizer } from './service.ts';

/** Gemini-backed Vietnamese 1-2 sentence summarizer, or null when GEMINI_API_KEY is not set. */
export function createNewsSummarizer(env: NodeJS.ProcessEnv = process.env): Summarizer | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const client = createGeminiModelClient(key);
  return async ({ title, snippet }) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    try {
      const raw = await client.generate({
        signal: ac.signal,
        systemInstruction:
          'Bạn tóm tắt tin hàng hóa bằng tiếng Việt trong 1-2 câu, chỉ dựa trên tiêu đề/đoạn trích được cung cấp. Không thêm số liệu, không dự đoán, không khuyến nghị mua/bán. Trả JSON có trường "summary"; "keyFacts", "risks" và "dataGaps" là mảng rỗng.',
        prompt: `Tiêu đề: ${title}\nĐoạn trích: ${snippet || '(không có)'}`,
      });
      const s = (JSON.parse(raw) as { summary?: unknown }).summary;
      return typeof s === 'string' && s.trim() ? s.trim().slice(0, 400) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
