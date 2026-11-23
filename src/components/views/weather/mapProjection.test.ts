import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_H, MAP_W, projectX, projectY, ringsToPath } from './mapProjection';

test('corners map to viewBox corners', () => {
  assert.equal(projectX(-125), 0);
  assert.equal(projectX(145), MAP_W);
  assert.equal(projectY(55), 0);
  assert.equal(projectY(-40), MAP_H);
});

test('projection is linear and north is up', () => {
  assert.equal(projectX(0) - projectX(-10), projectX(10) - projectX(0));
  assert.ok(projectY(10) < projectY(-10));
});

test('ringsToPath keeps inside rings, drops outside ones', () => {
  const inside = [[0, 0], [10, 0], [10, 10], [0, 0]];
  const outside = [[-170, 70], [-160, 70], [-160, 80], [-170, 70]];
  const d = ringsToPath([inside, outside]);
  assert.equal((d.match(/M/g) ?? []).length, 1);
  assert.ok(d.startsWith(`M${projectX(0).toFixed(1)} ${projectY(0).toFixed(1)}`));
  assert.equal(ringsToPath([outside]), '');
});
