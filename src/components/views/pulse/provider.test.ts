import test from 'node:test';
import assert from 'node:assert/strict';
import { providerOf } from './provider';

test('providerOf strips provenance details', () => {
  assert.equal(providerOf('Yahoo Finance chart API (UNOFFICIAL, delayed) API sync 2026-11-24'), 'Yahoo Finance chart API');
  assert.equal(providerOf('Yahoo Finance API sync 2026'), 'Yahoo Finance');
  assert.equal(providerOf('FRED - St. Louis Fed'), 'FRED');
  assert.equal(providerOf('FRED — St. Louis Fed'), 'FRED');
  assert.equal(providerOf('FRED Public CSV (DGS10)'), 'FRED Public CSV');
});

test('providerOf keeps plain names and never returns empty', () => {
  assert.equal(providerOf('Vietcombank'), 'Vietcombank');
  assert.equal(providerOf('(raw)'), '(raw)');
});
