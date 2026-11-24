import { useState } from 'react';
import { ExternalLink, PlayCircle } from 'lucide-react';
import type { LessonVideo } from './curriculum/types';

function youtubeId(url: string): string | null {
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/.exec(url);
  return m ? m[1] : null;
}

/** Curated videos from reputable sources. YouTube embeds load only after a click (privacy + speed). */
export function LessonVideos({ videos }: { videos: LessonVideo[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 space-y-2">
      <p className="text-xs font-semibold text-[var(--text-strong)]">Video tham khảo (nguồn uy tín)</p>
      <ul className="space-y-2">
        {videos.map((v) => {
          const yt = youtubeId(v.url);
          return (
            <li key={v.url} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {yt ? (
                  <button
                    type="button"
                    onClick={() => setOpen(open === v.url ? null : v.url)}
                    className="inline-flex items-center gap-1.5 min-h-10 text-left text-[var(--accent-text)] hover:underline"
                    aria-expanded={open === v.url}
                  >
                    <PlayCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {v.title}
                  </button>
                ) : (
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-10 text-[var(--accent-text)] hover:underline">
                    <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {v.title}
                  </a>
                )}
                <span className="text-[11px] text-[var(--muted)]">
                  {v.source} · {v.lang === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}
                  {v.duration ? ` · ${v.duration}` : ''}
                </span>
              </div>
              {v.note && <p className="text-xs text-[var(--muted)]">{v.note}</p>}
              {yt && open === v.url && (
                <div className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: '16 / 9' }}>
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${yt}`}
                    title={v.title}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-[var(--muted)]">Video thuộc bên thứ ba, chỉ để học; không phải khuyến nghị đầu tư.</p>
    </section>
  );
}
