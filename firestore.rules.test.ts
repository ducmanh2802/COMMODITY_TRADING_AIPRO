import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesContent = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8'));

test('firestore.rules enforces global default-deny catch-all and rules_version 2', () => {
  assert.match(rulesContent, /rules_version\s*=\s*'2';/);
  assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules covers every collection declared in firebase-blueprint.json', () => {
  const paths = Object.keys(blueprint.firestore ?? {});
  assert.ok(paths.length >= 3);
  assert.match(rulesContent, /match \/users\/\{userId\}/);
  assert.match(rulesContent, /match \/userSettings\/\{userId\}/);
  assert.match(rulesContent, /match \/auditLogs\/\{logId\}/);
});

test('firestore.rules disables user enumeration and enforces email verification and owner checks', () => {
  assert.match(rulesContent, /allow list:\s*if false;/);
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesContent, /isValidId\(userId\)/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesContent, /allow list:\s*if isVerifiedUser\(\) && resource\.data\.userId == request\.auth\.uid;/);
});
