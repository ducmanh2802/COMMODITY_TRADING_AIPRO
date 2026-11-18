import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_DRAFT,
  NOTE_LIMITS,
  buildCreatePayload,
  buildUpdatePayload,
  chartToPendingContext,
  collectFacets,
  consumePendingNoteContext,
  filterNotes,
  hasPendingNoteContext,
  newNoteId,
  normalizeTags,
  noteToDraft,
  parseNoteDoc,
  setPendingNoteContext,
  validateDraft,
  type NoteDraft,
  type ResearchNote,
} from './researchNotes';

const draft = (over: Partial<NoteDraft> = {}): NoteDraft => ({
  ...EMPTY_DRAFT,
  instrumentId: 'CBOT:ZC',
  title: 'Corn seasonality',
  ...over,
});

const note = (over: Partial<ResearchNote>): ResearchNote => ({
  id: 'n',
  userId: 'u',
  instrumentId: 'CBOT:ZC',
  title: 't',
  body: '',
  tags: [],
  chartContext: null,
  createdAtMs: 1,
  updatedAtMs: 1,
  ...over,
});

test('normalizeTags: split, strip #, lowercase, dedupe, drop invalid', () => {
  assert.deepEqual(normalizeTags('#Weather, wasde  weather,,bad!tag usda-report'), ['weather', 'wasde', 'usda-report']);
  assert.deepEqual(normalizeTags('   '), []);
  assert.deepEqual(normalizeTags('mùa_vụ'), ['mùa_vụ']);
});

test('validateDraft: required fields and limits', () => {
  assert.equal(validateDraft(draft()), null);
  assert.equal(validateDraft(draft({ instrumentId: ' ' })), 'instrumentRequired');
  assert.equal(validateDraft(draft({ instrumentId: 'x'.repeat(33) })), 'instrumentTooLong');
  assert.equal(validateDraft(draft({ title: '  ' })), 'titleRequired');
  assert.equal(validateDraft(draft({ title: 'x'.repeat(NOTE_LIMITS.titleMax + 1) })), 'titleTooLong');
  assert.equal(validateDraft(draft({ body: 'x'.repeat(NOTE_LIMITS.bodyMax + 1) })), 'bodyTooLong');
  assert.equal(validateDraft(draft({ body: 'x'.repeat(NOTE_LIMITS.bodyMax) })), null);
  assert.equal(validateDraft(draft({ tagsText: 'a b c d e f g h i' })), 'tooManyTags');
  assert.equal(validateDraft(draft({ tagsText: 'x'.repeat(33) })), 'tagTooLong');
  assert.equal(validateDraft(draft({ timeframe: 'D2' as NoteDraft['timeframe'] })), 'badTimeframe');
  assert.equal(validateDraft(draft({ contractCode: 'x'.repeat(25) })), 'contractTooLong');
  assert.equal(validateDraft(draft({ rangeStart: '2024-05-01', rangeEnd: '2024-01-01' })), 'rangeOrder');
  assert.equal(validateDraft(draft({ rangeStart: '2024-01-01', rangeEnd: '2024-05-01' })), null);
});

test('buildCreatePayload: exact key set, chartContext null when empty', () => {
  const p = buildCreatePayload('userA', draft({ title: '  T  ', tagsText: 'A' }), 'TS');
  assert.deepEqual(Object.keys(p).sort(), ['body', 'chartContext', 'createdAt', 'instrumentId', 'tags', 'title', 'updatedAt', 'userId']);
  assert.equal(p.title, 'T');
  assert.deepEqual(p.tags, ['a']);
  assert.equal(p.chartContext, null);
  assert.equal(p.createdAt, 'TS');
});

test('buildUpdatePayload: never touches userId/createdAt; keeps chart context', () => {
  const p = buildUpdatePayload(draft({ timeframe: 'D1', contractCode: 'ZCZ24' }), 'TS');
  assert.ok(!('userId' in p) && !('createdAt' in p));
  assert.deepEqual(p.chartContext, { timeframe: 'D1', contractCode: 'ZCZ24', rangeStart: '', rangeEnd: '' });
});

test('parseNoteDoc + noteToDraft round trip', () => {
  const n = parseNoteDoc('id1', {
    userId: 'u',
    instrumentId: 'CBOT:ZS',
    title: 'Soy',
    body: 'b',
    tags: ['x', 'y'],
    chartContext: { timeframe: 'H4', contractCode: 'ZSF25', rangeStart: 'a', rangeEnd: 'b' },
    createdAt: { toMillis: () => 5 },
    updatedAt: null,
  });
  assert.equal(n.createdAtMs, 5);
  assert.equal(n.updatedAtMs, null);
  const d = noteToDraft(n);
  assert.equal(d.tagsText, 'x, y');
  assert.equal(d.timeframe, 'H4');
  assert.equal(validateDraft(d), null);
  assert.equal(parseNoteDoc('z', { chartContext: { timeframe: 'bogus' } }).chartContext?.timeframe, '');
});

test('filterNotes: instrument, tag, text; newest first, pending on top', () => {
  const notes = [
    note({ id: 'a', instrumentId: 'CBOT:ZC', tags: ['wasde'], title: 'Corn yield', updatedAtMs: 10 }),
    note({ id: 'b', instrumentId: 'CBOT:ZS', tags: ['weather'], body: 'Dry Brazil', updatedAtMs: 20 }),
    note({ id: 'c', instrumentId: 'CBOT:ZC', tags: [], title: 'Pending', updatedAtMs: null }),
  ];
  const all = { instrumentId: '', tag: '', text: '' };
  assert.deepEqual(filterNotes(notes, all).map((n) => n.id), ['c', 'b', 'a']);
  assert.deepEqual(filterNotes(notes, { ...all, instrumentId: 'CBOT:ZC' }).map((n) => n.id), ['c', 'a']);
  assert.deepEqual(filterNotes(notes, { ...all, tag: 'WASDE' }).map((n) => n.id), ['a']);
  assert.deepEqual(filterNotes(notes, { ...all, text: 'brazil' }).map((n) => n.id), ['b']);
  assert.deepEqual(collectFacets(notes), { instruments: ['CBOT:ZC', 'CBOT:ZS'], tags: ['wasde', 'weather'] });
});

test('newNoteId matches rules isValidId', () => {
  const id = newNoteId(1700000000000, 0.5);
  assert.match(id, /^[a-zA-Z0-9_-]{1,128}$/);
});

test('chart hand-off is consumed once and drops unknown timeframes', () => {
  const ctx = chartToPendingContext({
    instrumentId: 'CBOT:ZC',
    contractCode: 'CONTINUOUS',
    timeframe: 'D1',
    firstTimestamp: '2024-01-02',
    lastTimestamp: '2024-06-28',
  });
  assert.equal(ctx.timeframe, 'D1');
  assert.equal(chartToPendingContext({ instrumentId: 'x', contractCode: '', timeframe: 'MN' }).timeframe, '');
  setPendingNoteContext(ctx);
  assert.equal(hasPendingNoteContext(), true);
  assert.deepEqual(consumePendingNoteContext(), ctx);
  assert.equal(consumePendingNoteContext(), null);
});
