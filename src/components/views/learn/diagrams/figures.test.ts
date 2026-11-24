import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM } from '../curriculum';
import { FIGURES_A } from './groupA';
import { FIGURES_B } from './groupB';
import { FIGURES_C } from './groupC';

test('figure keys are unique across groups', () => {
  const keys = [...Object.keys(FIGURES_A), ...Object.keys(FIGURES_B), ...Object.keys(FIGURES_C)];
  assert.equal(new Set(keys).size, keys.length);
});

test('every lesson figure id is registered', () => {
  const known = new Set([...Object.keys(FIGURES_A), ...Object.keys(FIGURES_B), ...Object.keys(FIGURES_C)]);
  for (const lesson of CURRICULUM.flatMap((l) => l.lessons)) {
    for (const id of lesson.figures ?? []) assert.ok(known.has(id), `${lesson.id}: unknown figure ${id}`);
  }
});
