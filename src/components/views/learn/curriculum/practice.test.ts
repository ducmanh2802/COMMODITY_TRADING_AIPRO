import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCED_ITEMS, resolveModule } from '../../../layout/navMap';
import { CURRICULUM_INDEX } from './indexData';
import { PRACTICE, PRACTICE_LABEL } from './practice';
import { vi } from '../../../../i18n/vi';

const lessonIds = new Set(CURRICULUM_INDEX.flatMap((l) => l.lessons.map((x) => x.id)));

test('practice: lesson ids exist, 1-2 unique targets each', () => {
  for (const [id, targets] of Object.entries(PRACTICE)) {
    assert.ok(lessonIds.has(id), `unknown lesson ${id}`);
    assert.ok(targets.length >= 1 && targets.length <= 2, id);
    assert.equal(new Set(targets.map((t) => t.to)).size, targets.length, id);
  }
});

test('practice: every target resolves to a real nav destination and has a label', () => {
  const advanced = new Set<string>(ADVANCED_ITEMS);
  for (const [id, targets] of Object.entries(PRACTICE)) {
    for (const tg of targets) {
      const ok = tg.to === 'sandbox' || resolveModule(tg.to) !== null || advanced.has(tg.to);
      assert.ok(ok, `${id} -> ${tg.to} not navigable`);
      const key = PRACTICE_LABEL[tg.to];
      assert.ok(key && key in vi, `${tg.to} label key missing`);
    }
  }
});
