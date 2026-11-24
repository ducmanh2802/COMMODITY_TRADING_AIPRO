import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldErrorProps, noteErrorFieldIds, paperBadNumberFields, paperOrderReasonFields, replayErrorFields } from './fieldErrors';

test('fieldErrorProps: valid field gets no aria-invalid', () => {
  assert.deepEqual(fieldErrorProps(false, 'x-err'), {});
  assert.deepEqual(fieldErrorProps(false, 'x-err', 'x-hint'), { 'aria-describedby': 'x-hint' });
});

test('fieldErrorProps: invalid field points at the error id', () => {
  assert.deepEqual(fieldErrorProps(true, 'x-err'), { 'aria-invalid': true, 'aria-describedby': 'x-err' });
  assert.deepEqual(fieldErrorProps(true, 'x-err', 'x-hint'), { 'aria-invalid': true, 'aria-describedby': 'x-err x-hint' });
});

test('paperOrderReasonFields maps check reasons to ticket fields', () => {
  assert.deepEqual(paperOrderReasonFields('BAD_QTY'), ['qty']);
  assert.deepEqual(paperOrderReasonFields('BAD_STOP'), ['sl']);
  assert.deepEqual(paperOrderReasonFields('BAD_TP'), ['tp']);
  assert.deepEqual(paperOrderReasonFields('NO_FREE_MARGIN'), []);
  assert.deepEqual(paperOrderReasonFields('BAD_FX'), []);
});

test('paperBadNumberFields lists only the unparsable inputs', () => {
  assert.deepEqual(paperBadNumberFields('bad', null, 5), ['sl']);
  assert.deepEqual(paperBadNumberFields(1, 'bad', 'bad'), ['tp', 'margin']);
  assert.deepEqual(paperBadNumberFields(null, null, null), []);
});

test('replayErrorFields maps engine codes to fields', () => {
  assert.deepEqual(replayErrorFields('STOP_TARGET_REQUIRED'), ['stop', 'target']);
  assert.deepEqual(replayErrorFields('BAD_LEVELS'), ['stop', 'target']);
  assert.deepEqual(replayErrorFields('BAD_CONTRACTS'), ['contracts']);
  assert.deepEqual(replayErrorFields('HAS_POSITION'), []);
});

test('noteErrorFieldIds maps validateDraft codes to inputs', () => {
  assert.deepEqual(noteErrorFieldIds('instrumentRequired'), ['nb-inst']);
  assert.deepEqual(noteErrorFieldIds('titleTooLong'), ['nb-title']);
  assert.deepEqual(noteErrorFieldIds('tagTooLong'), ['nb-tags']);
  assert.deepEqual(noteErrorFieldIds('rangeOrder'), ['nb-from', 'nb-to']);
  assert.deepEqual(noteErrorFieldIds('saveFailed'), []);
});
