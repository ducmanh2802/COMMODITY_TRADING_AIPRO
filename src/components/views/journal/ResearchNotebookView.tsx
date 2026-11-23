import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { LogIn, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTerminal } from '../../../contexts/TerminalContext';
import { handleFirestoreError, OperationType } from '../../../firebase';
import { db } from '../../../firestoreDb';
import { fmtDateTime, useT, type TKey } from '../../../i18n';
import {
  EMPTY_DRAFT,
  NOTE_LIMITS,
  NOTE_TIMEFRAMES,
  buildCreatePayload,
  buildUpdatePayload,
  collectFacets,
  consumePendingNoteContext,
  filterNotes,
  newNoteId,
  noteToDraft,
  parseNoteDoc,
  peekPendingNoteContext,
  validateDraft,
  type NoteDraft,
  type NoteFilter,
  type NoteTimeframe,
  type ResearchNote,
} from './researchNotes';

const COLLECTION = 'researchNotes';
const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs text-[var(--text-strong)]';
const labelCls = 'block text-xs text-[var(--text)]/65 mb-1';

/** T18 Research Notebook: owner-only notes per instrument, optionally carrying chart context. */
export function ResearchNotebookView() {
  const { user, authReady, signInWithGoogle } = useAuth();
  const { instruments } = useTerminal();
  const t = useT();

  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(() => {
    const pending = peekPendingNoteContext();
    return pending ? { ...EMPTY_DRAFT, ...pending } : EMPTY_DRAFT;
  });
  const [fromChart, setFromChart] = useState(() => draft.instrumentId !== '');
  // Clear the chart hand-off once mounted so revisiting the module starts on a blank draft.
  useEffect(() => {
    consumePendingNoteContext();
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoteFilter>({ instrumentId: '', tag: '', text: '' });

  const canWrite = !!user && user.emailVerified;

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setNotes([]);
      return;
    }
    const q = query(collection(db, COLLECTION), where('userId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(null);
        setNotes(snap.docs.map((d) => parseNoteDoc(d.id, d.data())));
      },
      (err) => {
        setLoadError(handleFirestoreError(err, OperationType.LIST, COLLECTION).userMessage || t('nb.loadFailed'));
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const facets = useMemo(() => collectFacets(notes), [notes]);
  const visible = useMemo(() => filterNotes(notes, filter), [notes, filter]);

  // Instrument options: Instrument Master + anything already referenced by notes / the draft.
  const instrumentOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const i of instruments) labels.set(i.id, `${i.id} · ${i.productName}`);
    for (const id of [...facets.instruments, draft.instrumentId]) if (id && !labels.has(id)) labels.set(id, id);
    return [...labels.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [instruments, facets.instruments, draft.instrumentId]);
  const instrumentLabel = (id: string) => instrumentOptions.find(([k]) => k === id)?.[1] ?? id;

  const setField = <K extends keyof NoteDraft>(k: K, v: NoteDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setError(null);
  };

  const resetForm = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setFromChart(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.emailVerified) return;
    const problem = validateDraft(draft);
    if (problem) {
      setError(t(`nb.err.${problem}` as TKey));
      return;
    }
    setSaving(true);
    setError(null);
    const id = editingId ?? newNoteId();
    const path = `${COLLECTION}/${id}`;
    try {
      if (editingId) await updateDoc(doc(db, COLLECTION, id), buildUpdatePayload(draft, serverTimestamp()));
      else await setDoc(doc(db, COLLECTION, id), buildCreatePayload(user.uid, draft, serverTimestamp()));
      resetForm();
    } catch (err) {
      const info = handleFirestoreError(err, editingId ? OperationType.UPDATE : OperationType.CREATE, path);
      setError(info.userMessage || t('nb.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (n: ResearchNote) => {
    if (!window.confirm(t('nb.confirmDelete', { title: n.title }))) return;
    try {
      await deleteDoc(doc(db, COLLECTION, n.id));
      if (editingId === n.id) resetForm();
    } catch (err) {
      setError(handleFirestoreError(err, OperationType.DELETE, `${COLLECTION}/${n.id}`).userMessage || t('nb.deleteFailed'));
    }
  };

  const startEdit = (n: ResearchNote) => {
    setDraft(noteToDraft(n));
    setEditingId(n.id);
    setFromChart(false);
    setError(null);
  };

  if (!user) {
    return (
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center space-y-3">
        <NotebookPen className="w-8 h-8 text-[var(--accent)] mx-auto" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('nb.signInTitle')}</h2>
        <p className="text-xs text-[var(--text)]/65 max-w-md mx-auto">{t('nb.signInBody')}</p>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md"
        >
          <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('nb.signInGoogle')}</span>
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('nb.title')}</h2>
        <p className="text-sm text-[var(--text)]/65 mt-1">{t('nb.subtitle')}</p>
        {!canWrite && <p className="text-xs text-[var(--warning)] mt-2">{t('nb.verifyEmail')}</p>}
      </div>

      {/* Create / edit */}
      <form onSubmit={(e) => void handleSubmit(e)} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{editingId ? t('nb.editNote') : t('nb.newNote')}</h2>
        {fromChart && !editingId && <p className="text-[11px] text-[var(--accent)]">{t('nb.fromChart')}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="nb-inst" className={labelCls}>{t('nb.instrument')}</label>
            <select id="nb-inst" value={draft.instrumentId} onChange={(e) => setField('instrumentId', e.target.value)} className={`${inputCls} font-mono`}>
              <option value="">{t('nb.selectInstrument')}</option>
              {instrumentOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="nb-title" className={labelCls}>{t('nb.noteTitle')}</label>
            <input
              id="nb-title"
              type="text"
              value={draft.title}
              maxLength={NOTE_LIMITS.titleMax}
              placeholder={t('nb.titlePh')}
              onChange={(e) => setField('title', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label htmlFor="nb-body" className={labelCls}>{t('nb.body')}</label>
          <textarea
            id="nb-body"
            rows={6}
            value={draft.body}
            maxLength={NOTE_LIMITS.bodyMax}
            placeholder={t('nb.bodyPh')}
            onChange={(e) => setField('body', e.target.value)}
            className={`${inputCls} resize-y`}
          />
          <p className="text-[11px] text-[var(--text)]/45 text-right">{t('nb.chars', { n: draft.body.length, max: NOTE_LIMITS.bodyMax })}</p>
        </div>
        <div>
          <label htmlFor="nb-tags" className={labelCls}>{t('nb.tags')}</label>
          <input id="nb-tags" type="text" value={draft.tagsText} placeholder={t('nb.tagsPh')} onChange={(e) => setField('tagsText', e.target.value)} className={inputCls} />
        </div>
        <fieldset className="border border-[var(--border)] rounded-md p-3">
          <legend className="text-xs text-[var(--text)]/65 px-1">{t('nb.chartContext')}</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="nb-tf" className={labelCls}>{t('nb.timeframe')}</label>
              <select id="nb-tf" value={draft.timeframe} onChange={(e) => setField('timeframe', e.target.value as NoteTimeframe | '')} className={`${inputCls} font-mono`}>
                <option value="">{t('nb.none')}</option>
                {NOTE_TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="nb-contract" className={labelCls}>{t('nb.contract')}</label>
              <input id="nb-contract" type="text" value={draft.contractCode} maxLength={NOTE_LIMITS.contractCodeMax} placeholder={t('nb.contractPh')} onChange={(e) => setField('contractCode', e.target.value)} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label htmlFor="nb-from" className={labelCls}>{t('nb.rangeStart')}</label>
              <input id="nb-from" type="text" value={draft.rangeStart} maxLength={NOTE_LIMITS.rangeMax} placeholder="YYYY-MM-DD" onChange={(e) => setField('rangeStart', e.target.value)} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label htmlFor="nb-to" className={labelCls}>{t('nb.rangeEnd')}</label>
              <input id="nb-to" type="text" value={draft.rangeEnd} maxLength={NOTE_LIMITS.rangeMax} placeholder="YYYY-MM-DD" onChange={(e) => setField('rangeEnd', e.target.value)} className={`${inputCls} font-mono`} />
            </div>
          </div>
        </fieldset>
        {error && <p className="text-xs font-mono text-[var(--negative)]">{error}</p>}
        <div className="flex justify-end gap-2">
          {(editingId || draft !== EMPTY_DRAFT) && (
            <button type="button" onClick={resetForm} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs text-[var(--text)]/80">
              {t('nb.cancel')}
            </button>
          )}
          <button
            type="submit"
            disabled={saving || !canWrite}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? t('nb.saving') : editingId ? t('nb.update') : t('nb.save')}</span>
          </button>
        </div>
      </form>

      {/* List + filters */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-end gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-strong)] mr-auto">{t('nb.notes', { n: visible.length })}</h2>
          <select aria-label={t('nb.filterInstrument')} value={filter.instrumentId} onChange={(e) => setFilter((f) => ({ ...f, instrumentId: e.target.value }))} className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs font-mono text-[var(--text-strong)]">
            <option value="">{t('nb.filterInstrument')}: {t('nb.all')}</option>
            {facets.instruments.map((id) => (
              <option key={id} value={id}>{instrumentLabel(id)}</option>
            ))}
          </select>
          <select aria-label={t('nb.filterTag')} value={filter.tag} onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))} className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text-strong)]">
            <option value="">{t('nb.filterTag')}: {t('nb.all')}</option>
            {facets.tags.map((tag) => (
              <option key={tag} value={tag}>#{tag}</option>
            ))}
          </select>
          <input type="search" aria-label={t('nb.filterText')} placeholder={t('nb.filterText')} value={filter.text} onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))} className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text-strong)]" />
        </div>
        {loadError && <p className="px-4 py-2 text-xs text-[var(--negative)]">{loadError}</p>}
        {visible.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[var(--text)]/60">{notes.length === 0 ? t('nb.empty') : t('nb.emptyFiltered')}</div>
        ) : (
          <ul className="divide-y divide-[var(--border)]/70">
            {visible.map((n) => (
              <li key={n.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 mr-auto">
                    <p className="text-sm text-[var(--text-strong)] font-medium break-words">{n.title}</p>
                    <p className="text-[11px] font-mono text-[var(--text)]/55">
                      {instrumentLabel(n.instrumentId)}
                      {n.chartContext && (
                        <>
                          {' · '}
                          {[n.chartContext.contractCode, n.chartContext.timeframe].filter(Boolean).join(' ')}
                          {(n.chartContext.rangeStart || n.chartContext.rangeEnd) && ` · ${n.chartContext.rangeStart} → ${n.chartContext.rangeEnd}`}
                        </>
                      )}
                      {' · '}
                      {n.updatedAtMs === null ? t('nb.pending') : t('nb.updated', { when: fmtDateTime(n.updatedAtMs) })}
                    </p>
                  </div>
                  <button type="button" onClick={() => startEdit(n)} aria-label={t('nb.edit')} className="p-1 text-[var(--text)]/75 hover:bg-[var(--surface-2)] rounded">
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => void handleDelete(n)} aria-label={t('nb.delete')} className="p-1 text-[var(--negative)] hover:bg-[var(--negative)]/15 rounded">
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
                {n.body && <p className="text-xs text-[var(--text)]/80 whitespace-pre-wrap break-words">{n.body}</p>}
                {n.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {n.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setFilter((f) => ({ ...f, tag }))}
                        className="px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[11px] text-[var(--accent-text)]"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default ResearchNotebookView;
