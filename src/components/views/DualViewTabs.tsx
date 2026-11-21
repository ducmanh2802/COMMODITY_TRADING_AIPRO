import { useState, type ReactNode } from 'react';

export interface DualViewTab {
  id: string;
  label: string;
  note: string;
  render: () => ReactNode;
}

/**
 * One module, two implementations (merge of agent work + origin/main e7a6c70). The first tab is the
 * primary implementation; the second keeps the alternative reachable without a duplicate nav item.
 */
export function DualViewTabs({ tabs, initialTabId }: { tabs: DualViewTab[]; initialTabId?: string }) {
  const [active, setActive] = useState(() => initialTabId ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current?.id}
            onClick={() => setActive(tab.id)}
            title={tab.note}
            className={`px-3 py-2 min-h-9 text-xs rounded-md border ${
              tab.id === current?.id
                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-strong)]'
                : 'border-white/10 text-[var(--text)]/70 hover:text-[var(--text-strong)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current?.render()}
    </div>
  );
}
