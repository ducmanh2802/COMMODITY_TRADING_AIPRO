import type { Source } from './curriculum/types';

export function SourceLinks({ sources }: { sources: Source[] }) {
  return (
    <p className="text-[11px] text-[var(--text)]/50">
      Nguồn:{' '}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ' · '}
          <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-[var(--text)]">
            {s.label}
          </a>
        </span>
      ))}
    </p>
  );
}
