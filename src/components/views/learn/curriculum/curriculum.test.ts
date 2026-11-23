import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRICULUM } from './index';
import type { Lesson } from './types';
import { INITIAL_INSTRUMENTS } from '../../../../../server/data/instruments';

const lessons: { level: number; lesson: Lesson }[] = CURRICULUM.flatMap((l) => l.lessons.map((lesson) => ({ level: l.number, lesson })));
const instruments = new Map(INITIAL_INSTRUMENTS.map((i) => [i.id, i]));

// Valid AppModuleId list is parsed from the type declaration so the test follows the source of truth.
const riskSrc = readFileSync(new URL('../../../../shared/types/risk.ts', import.meta.url), 'utf8');
const moduleBlock = /export type AppModuleId =([\s\S]*?);/.exec(riskSrc)?.[1] ?? '';
const MODULE_IDS = new Set([...moduleBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]));

const textOf = (l: Lesson): string[] => [...l.body, l.textExample ?? '', ...(l.examples ?? []).flatMap((e) => [e.title, e.text]), ...l.remember, ...l.quiz.flatMap((x) => [x.q, x.why, ...x.options])];

test('10 levels numbered 1..10 in order', () => {
  assert.equal(CURRICULUM.length, 10);
  CURRICULUM.forEach((l, i) => assert.equal(l.number, i + 1));
});

test('unique level and lesson ids', () => {
  const lv = CURRICULUM.map((l) => l.id);
  assert.equal(new Set(lv).size, lv.length);
  const ls = lessons.map((x) => x.lesson.id);
  assert.equal(new Set(ls).size, ls.length);
});

test('quiz structure per lesson', () => {
  for (const { lesson } of lessons) {
    assert.ok(lesson.quiz.length >= 3, `${lesson.id} has ${lesson.quiz.length} questions`);
    const seen = new Set<string>();
    for (const x of lesson.quiz) {
      assert.ok(x.options.length >= 2, `${lesson.id}: <2 options: ${x.q}`);
      assert.equal(new Set(x.options).size, x.options.length, `${lesson.id}: duplicate options: ${x.q}`);
      assert.ok(Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.options.length, `${lesson.id}: answer out of range: ${x.q}`);
      assert.ok(x.why.trim().length > 0, `${lesson.id}: empty why: ${x.q}`);
      assert.ok(x.q.trim().length > 0);
      assert.ok(!seen.has(x.q), `${lesson.id}: duplicate question: ${x.q}`);
      seen.add(x.q);
    }
  }
});

test('instrument references exist in instrument master', () => {
  for (const { lesson } of lessons) {
    const ids = [...(lesson.instrumentIds ?? [])];
    if (lesson.example) ids.push(lesson.example.calc.instrumentId);
    for (const id of ids) assert.ok(instruments.has(id), `${lesson.id}: unknown instrument ${id}`);
  }
});

test('link modules are valid AppModuleId', () => {
  assert.ok(MODULE_IDS.size > 10);
  for (const { lesson } of lessons) {
    for (const link of lesson.links ?? []) assert.ok(MODULE_IDS.has(link.module), `${lesson.id}: bad module ${link.module}`);
    for (const c of lesson.checklist ?? []) if (c.module) assert.ok(MODULE_IDS.has(c.module), `${lesson.id}: bad checklist module ${c.module}`);
  }
});

test('every lesson has an https source', () => {
  for (const { lesson } of lessons) {
    assert.ok(lesson.sources.length >= 1, `${lesson.id}: no sources`);
    assert.ok(lesson.sources.some((s) => s.url.startsWith('https://')), `${lesson.id}: no https source`);
  }
});

test('quiz answer positions are balanced', () => {
  const counts = new Map<number, number>();
  let total = 0;
  for (const { lesson } of lessons) for (const x of lesson.quiz) { counts.set(x.answer, (counts.get(x.answer) ?? 0) + 1); total++; }
  for (const [idx, n] of counts) assert.ok(n / total <= 0.6, `answer index ${idx} is ${((n / total) * 100).toFixed(0)}% of ${total}`);
});

test('"Cấp N" cross-references point to 1..10', () => {
  for (const { lesson } of lessons) {
    for (const t of textOf(lesson)) {
      for (const m of t.matchAll(/Cấp\s+(\d+)/g)) {
        const n = Number(m[1]);
        assert.ok(n >= 1 && n <= 10, `${lesson.id}: "${m[0]}"`);
      }
    }
  }
});

// USD per 1 quoted unit (cent, USD/t, USD/oz, USD/bbl) = tickValue / minimumTickSize.
const usdPerUnit = (id: string): number => {
  const s = instruments.get(id)!.specification;
  return s.tickValue! / s.minimumTickSize!;
};

test('contract math stated in text matches instrument master', () => {
  const rules: { re: RegExp; id: string; usd: number; contractSize: number; unitFactor: number }[] = [
    { re: /1 cent = 50 USD/g, id: 'CBOT:ZC', usd: 50, contractSize: 5000, unitFactor: 0.01 },
    { re: /1 cent = 375 USD/g, id: 'ICE:KC', usd: 375, contractSize: 37500, unitFactor: 0.01 },
    { re: /1 USD\/tấn = 10 USD/g, id: 'ICE:RC', usd: 10, contractSize: 10, unitFactor: 1 },
    { re: /1 USD\/oz = 100 USD/g, id: 'COMEX:GC', usd: 100, contractSize: 100, unitFactor: 1 },
    { re: /1 USD\/thùng = 1\.000 USD/g, id: 'NYMEX:CL', usd: 1000, contractSize: 1000, unitFactor: 1 },
  ];
  const corpus = [...lessons.flatMap(({ lesson }) => textOf(lesson)), readFileSync(new URL('./extras.ts', import.meta.url), 'utf8')].join('\n');
  for (const r of rules) {
    const spec = instruments.get(r.id)!.specification;
    assert.equal(spec.contractSize! * r.unitFactor, r.usd, `${r.id} contractSize x unit`);
    assert.equal(spec.contractSize, r.contractSize, `${r.id} contractSize`);
    assert.equal(usdPerUnit(r.id), r.usd, `${r.id} tickValue/tick`);
    assert.ok(r.re.test(corpus), `pattern ${r.re} not found in curriculum (stale test?)`);
  }
});
