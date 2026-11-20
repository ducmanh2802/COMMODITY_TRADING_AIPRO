/** Web Speech API helper for "Đọc to". Everything is optional: returns false when unsupported. */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function hasVietnameseVoice(): boolean {
  if (!speechSupported()) return false;
  return window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith('vi'));
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** Speaks `text`; prefers a vi-VN voice when present. Calls onEnd when finished or on error. */
export function speak(text: string, lang: string, onEnd: () => void): boolean {
  if (!speechSupported()) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (voice) u.voice = voice;
    u.rate = 0.9;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
