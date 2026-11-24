import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__fixtures__' || name === 'chaos') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);

test('audit: every external fetch() in server code is bounded by an AbortSignal timeout', () => {
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:fetchFn|fetchImpl|fetch)\(\s*([^;]*?)\)\s*;?\s*$/gms)) void m; // (kept simple below)
    const re = /(?<![.\w])(?:this\.)?(fetchFn|fetchImpl|fetch)\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const line = src.slice(lineStart, src.indexOf('\n', m.index));
      if (/^\s*(\/\/|\*)/.test(line) || /function\s|=>\s*globalThis|=\s*(options|params|opts)\./.test(line)) continue;
      const window = src.slice(m.index, m.index + 600);
      if (!/signal\s*[:,]|signal\b/.test(window.split(/\n\s*\n|;\s*\n/)[0] + window.slice(0, 400))) {
        offenders.push(`${f.slice(ROOT.length)}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `fetch without AbortSignal: ${offenders.join(', ')}`);
});

test('audit: Gemini generateContent calls carry an abortSignal', () => {
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const re = /generateContent\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (!/abortSignal/.test(src.slice(m.index, m.index + 2500))) offenders.push(`${f.slice(ROOT.length)}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('audit: User-Agent strings carry no personal info (email, name, user path, host)', () => {
  const uas: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/User-Agent['"]?\s*:\s*['"`]([^'"`]+)['"`]/gi)) uas.push(m[1]);
    for (const m of src.matchAll(/(?:YAHOO_UA|YAHOO_USER_AGENT)\s*=\s*['"`]([^'"`]+)['"`]/g)) uas.push(m[1]);
  }
  assert.ok(uas.length > 0);
  for (const ua of uas) {
    assert.ok(!/@|\.com|\.vn|windows|users[\\/]|localhost|phai|sinh/i.test(ua.replace('Mozilla/5.0 (compatible;', '')), `suspicious UA: ${ua}`);
  }
});
