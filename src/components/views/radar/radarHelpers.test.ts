import test from 'node:test';
import assert from 'node:assert/strict';
import type { RadarRating, RadarRatingComponent } from '../../../shared/types/radar';
import { barValue, groupScores, parseRR } from './radarHelpers';

const c = (label: string, points: number, max: number, note = '', available = true): RadarRatingComponent => ({ label, points, max, note, available });
const rating = (components: RadarRatingComponent[]): RadarRating => ({ rating: 50, grade: 'C', direction: 'CHƯA RÕ', confidence: 'THẤP', components });

test('parseRR reads the reward:risk written into the setup note', () => {
  assert.equal(parseRR(rating([c('Chất lượng thiết lập', 5, 10, 'R:R ước tính 1:2,3')])), 2.3);
  assert.equal(parseRR(rating([c('Chất lượng thiết lập', 5, 10, 'R:R 1:1.500')])), 1500);
});

test('parseRR returns null when absent', () => {
  assert.equal(parseRR(undefined), null);
  assert.equal(parseRR(rating([c('Chất lượng thiết lập', 5, 10, 'không có tỷ lệ')])), null);
  assert.equal(parseRR(rating([c('Xu hướng ngày', 5, 10, 'R:R 1:2')])), null);
});

test('groupScores sums points/max per group and flags missing inputs', () => {
  const g = groupScores(
    rating([
      c('Xu hướng ngày', 6, 10),
      c('Xu hướng tuần', 4, 10),
      c('Chất lượng thiết lập', 3, 15),
      c('Vị thế COT', 0, 5, '', false),
      c('Không thuộc nhóm', 9, 9),
    ])
  );
  assert.deepEqual(
    g.map((x) => [x.id, x.points, x.max, x.missing]),
    [
      ['trend', 10, 20, false],
      ['setup', 3, 15, false],
      ['risk', 0, 5, true],
    ]
  );
});

test('groupScores drops groups with no components', () => {
  assert.deepEqual(groupScores(rating([])), []);
});

test('barValue prefers rating over activity score', () => {
  assert.equal(barValue({ score: 80, rating: { rating: 42 } }), 42);
  assert.equal(barValue({ score: 80 }), 80);
  assert.equal(barValue({ score: 80, rating: { rating: 0 } }), 0);
});
