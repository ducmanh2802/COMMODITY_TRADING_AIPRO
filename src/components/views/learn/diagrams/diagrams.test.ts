import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM } from '../curriculum';
import { DIAGRAM_IDS } from './ids';

test('every lesson diagram id is a known DiagramId', () => {
  const known = new Set<string>(DIAGRAM_IDS);
  const used = CURRICULUM.flatMap((l) => l.lessons).filter((l) => l.diagram);
  assert.ok(used.length >= 6);
  for (const l of used) assert.ok(known.has(l.diagram as string), `${l.id}: unknown diagram ${l.diagram}`);
});
