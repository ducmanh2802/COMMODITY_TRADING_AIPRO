import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Dicts are spread into vi/en in order, so a key defined in two dict files
// silently overrides the earlier one (e.g. a feature title replacing another page's).
test('no i18n key is defined in more than one dict file', async () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'dict');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const owner = new Map<string, string>();
  const dups: string[] = [];
  for (const f of files) {
    const mod = (await import(pathToFileURL(join(dir, f)).href)) as { vi?: Record<string, string> };
    for (const k of Object.keys(mod.vi ?? {})) {
      const prev = owner.get(k);
      if (prev) dups.push(`${k} (${prev}, ${f})`);
      else owner.set(k, f);
    }
  }
  assert.deepEqual(dups, [], `duplicate keys: ${dups.join('; ')}`);
});
