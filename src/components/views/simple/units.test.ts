import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertToVnd, trafficLight } from './units.ts';

test('cents/lb converts exactly to VND/kg', () => {
  const c = convertToVnd('KC', 'cents/lb', 'USD', 100, 25000);
  assert.ok(c);
  // 1 USD/lb = 2.2046226 USD/kg -> 55115.6 đ/kg
  assert.ok(Math.abs(c.vndPerKg - 25000 / 0.45359237) < 1e-6);
  assert.equal(Math.round(c.vndPerTon), Math.round(c.vndPerKg * 1000));
});

test('USD/MT -> VND/kg', () => {
  const c = convertToVnd('RC', 'USD/MT', 'USD', 4000, 25000);
  assert.equal(c?.vndPerKg, 100000);
});

test('bushel needs a known trade weight', () => {
  assert.ok(convertToVnd('ZC', 'cents/bushel', 'USD', 450, 25000));
  assert.equal(convertToVnd('XX', 'cents/bushel', 'USD', 450, 25000), null);
});

test('refuses without rate / non-weight units / non-USD', () => {
  assert.equal(convertToVnd('RC', 'USD/MT', 'USD', 4000, null), null);
  assert.equal(convertToVnd('GC', 'USD/troy oz', 'USD', 2000, 25000), null);
  assert.equal(convertToVnd('JRU', 'JPY/kg', 'JPY', 300, 25000), null);
  assert.equal(convertToVnd('RC', 'USD/MT', 'USD', null, 25000), null);
});

test('traffic light', () => {
  assert.equal(trafficLight(false, 5, false), 'gray');
  assert.equal(trafficLight(true, null, false), 'yellow');
  assert.equal(trafficLight(true, 1, true), 'yellow');
  assert.equal(trafficLight(true, 1, false), 'green');
  assert.equal(trafficLight(true, -1, false), 'red');
  assert.equal(trafficLight(true, 0.1, false), 'yellow');
});
