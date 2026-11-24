import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPER_PREFS_KEY,
  getCoolOffEnabled,
  handlePaperPrefsStorageEvent,
  setCoolOffEnabled,
  subscribeCoolOffPrefs,
} from './coolOffPrefs';

test('storage event from another tab clears the cache and notifies subscribers', () => {
  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  try {
    setCoolOffEnabled(false);
    assert.equal(getCoolOffEnabled(), false);
    let calls = 0;
    const unsub = subscribeCoolOffPrefs(() => calls++);
    // Another tab turns it back on: storage changes underneath the module cache.
    store.set(PAPER_PREFS_KEY, JSON.stringify({ coolOff: true }));
    assert.equal(getCoolOffEnabled(), false, 'cache still holds the old value');
    handlePaperPrefsStorageEvent({ key: 'unrelated.key' });
    assert.equal(calls, 0);
    handlePaperPrefsStorageEvent({ key: PAPER_PREFS_KEY });
    assert.equal(calls, 1);
    assert.equal(getCoolOffEnabled(), true);
    // localStorage.clear() in another tab fires key === null.
    store.clear();
    handlePaperPrefsStorageEvent({ key: null });
    assert.equal(calls, 2);
    assert.equal(getCoolOffEnabled(), true, 'defaults to ON');
    unsub();
  } finally {
    g.localStorage = prev;
  }
});
