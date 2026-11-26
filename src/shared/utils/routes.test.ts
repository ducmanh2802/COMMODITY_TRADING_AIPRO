import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODULE, MODULE_SLUGS, moduleForPath, pathForModule } from './routes';
import type { AppModuleId } from '../types/risk';

test('every module round-trips through its path', () => {
  for (const id of Object.keys(MODULE_SLUGS) as AppModuleId[]) {
    assert.equal(moduleForPath(pathForModule(id)), id);
  }
});

test('slugs are unique, ascii, lowercase', () => {
  const slugs = Object.values(MODULE_SLUGS);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9-]*$/);
});

test('unknown path falls back to default; trailing slash and subpaths tolerated', () => {
  assert.equal(moduleForPath('/'), DEFAULT_MODULE);
  assert.equal(moduleForPath('/khong-co'), DEFAULT_MODULE);
  assert.equal(moduleForPath('/hoc-vien/'), 'learn');
  assert.equal(moduleForPath('/hoc-vien/bai/x'), 'learn');
  assert.equal(moduleForPath('/thi-truong'), 'market-hub');
});
