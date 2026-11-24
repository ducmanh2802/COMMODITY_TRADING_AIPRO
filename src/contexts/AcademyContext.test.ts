import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACADEMY_PROGRESS_KEY,
  applyLessonNote,
  applyLessonScore,
  createEmptyProgress,
  loadAcademyProgress,
  saveAcademyProgress,
  toggleBookmarkState,
  toggleChecklistItem,
  toggleLessonDoneState,
} from './AcademyContext';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    removeItem(k: string) {
      map.delete(k);
    },
    setItem(k: string, v: string) {
      map.set(k, v);
    },
  };
}

test('applyLessonNote creates, updates, and deletes whitespace-only notes cleanly', () => {
  let p = createEmptyProgress();
  p = applyLessonNote(p, 'l1-commodity', 'Note 1');
  assert.equal(p.notes?.['l1-commodity'], 'Note 1');

  p = applyLessonNote(p, 'l1-commodity', 'Updated note');
  assert.equal(p.notes?.['l1-commodity'], 'Updated note');

  p = applyLessonNote(p, 'l1-commodity', '   ');
  assert.equal(p.notes?.['l1-commodity'], undefined);
});

test('applyLessonScore tracks best score and marks done >= 60%', () => {
  let p = createEmptyProgress();
  p = applyLessonScore(p, 'l1-commodity', 40);
  assert.deepEqual(p.lessons['l1-commodity'], { best: 40, done: false });

  p = applyLessonScore(p, 'l1-commodity', 80);
  assert.deepEqual(p.lessons['l1-commodity'], { best: 80, done: true });

  p = applyLessonScore(p, 'l1-commodity', 20);
  assert.deepEqual(p.lessons['l1-commodity'], { best: 80, done: true });
});

test('toggleLessonDoneState and toggleChecklistItem flip boolean states cleanly', () => {
  let p = createEmptyProgress();
  p = toggleLessonDoneState(p, 'l1-commodity');
  assert.equal(p.lessons['l1-commodity']?.done, true);
  p = toggleLessonDoneState(p, 'l1-commodity');
  assert.equal(p.lessons['l1-commodity']?.done, false);

  p = toggleChecklistItem(p, 'step-1');
  assert.equal(p.checklist['step-1'], true);
  p = toggleChecklistItem(p, 'step-1');
  assert.equal(p.checklist['step-1'], false);
});

test('toggleBookmarkState adds and removes lesson IDs while keeping unique order', () => {
  let p = createEmptyProgress();
  p = toggleBookmarkState(p, 'l1-commodity');
  p = toggleBookmarkState(p, 'l1-spot-futures');
  assert.deepEqual(p.bookmarked, ['l1-commodity', 'l1-spot-futures']);

  p = toggleBookmarkState(p, 'l1-commodity');
  assert.deepEqual(p.bookmarked, ['l1-spot-futures']);

  p = toggleBookmarkState(p, '   ');
  assert.deepEqual(p.bookmarked, ['l1-spot-futures']);
});

test('loadAcademyProgress and saveAcademyProgress handle valid, legacy, and corrupt storage', () => {
  const storage = createMemoryStorage();
  const sample = toggleBookmarkState(
    applyLessonNote(applyLessonScore(createEmptyProgress(), 'l1-commodity', 90), 'l1-commodity', 'Keep'),
    'l1-commodity'
  );
  saveAcademyProgress(sample, storage);

  const loaded = loadAcademyProgress(storage);
  assert.deepEqual(loaded, sample);

  // Legacy data missing `notes` and `bookmarked` should default cleanly
  storage.setItem(ACADEMY_PROGRESS_KEY, JSON.stringify({ lessons: { 'l1-spot-futures': { done: true } }, checklist: {} }));
  const legacyLoaded = loadAcademyProgress(storage);
  assert.deepEqual(legacyLoaded.notes, {});
  assert.deepEqual(legacyLoaded.bookmarked, []);
  assert.equal(legacyLoaded.lessons['l1-spot-futures']?.done, true);

  // Corrupt or duplicate bookmarked entries are sanitized cleanly
  storage.setItem(
    ACADEMY_PROGRESS_KEY,
    JSON.stringify({ lessons: {}, checklist: {}, notes: {}, bookmarked: ['l1-commodity', 42, '', 'l1-commodity', 'l2-fx-fees'] })
  );
  assert.deepEqual(loadAcademyProgress(storage).bookmarked, ['l1-commodity', 'l2-fx-fees']);

  // Corrupt JSON falls back cleanly
  storage.setItem(ACADEMY_PROGRESS_KEY, '{bad-json');
  assert.deepEqual(loadAcademyProgress(storage), createEmptyProgress());
});
