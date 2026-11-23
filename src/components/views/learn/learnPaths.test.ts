import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM } from './curriculum';
import { LEARN_GOALS, LEARN_PATHS, nextLesson } from './learnPaths';

const ids = new Set(CURRICULUM.flatMap((l) => l.lessons.map((x) => x.id)));

test('every path lesson id exists, no duplicates, sensible length', () => {
  for (const g of LEARN_GOALS) {
    const p = LEARN_PATHS[g];
    assert.ok(p.length >= 12 && p.length <= 20, g);
    assert.equal(new Set(p).size, p.length, `${g} duplicates`);
    for (const id of p) assert.ok(ids.has(id), `${g}: ${id} missing`);
  }
});

test('nextLesson picks first unfinished and handles completion', () => {
  const p = LEARN_PATHS.hedge;
  assert.deepEqual(nextLesson('hedge', {}), { total: p.length, doneCount: 0, step: 1, nextId: p[0] });
  const s = nextLesson('hedge', { [p[0]]: { done: true }, [p[1]]: { done: false }, [p[2]]: { done: true } });
  assert.equal(s.nextId, p[1]);
  assert.equal(s.step, 2);
  assert.equal(s.doneCount, 2);
  const all = Object.fromEntries(p.map((id) => [id, { done: true }]));
  const f = nextLesson('hedge', all);
  assert.equal(f.nextId, null);
  assert.equal(f.step, p.length);
});
