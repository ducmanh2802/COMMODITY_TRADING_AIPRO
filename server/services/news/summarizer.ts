import { isAiConfigured } from '../../lib/geminiModels.ts';
import { createGeminiModelClient } from '../aiAnalyst.ts';
import type { Summarizer } from './service.ts';

/** AI-backed Vietnamese 1-2 sentence summarizer, or null when neither GEMINI_API_KEY nor OPENROUTER_API_KEY is set. */
export function createNewsSummarizer(env: NodeJS.ProcessEnv = process.env): Summarizer | null {
  if (!isAiConfigured(env)) return null;
  const client = createGeminiModelClient(env.GEMINI_API_KEY?.trim() || null);
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
