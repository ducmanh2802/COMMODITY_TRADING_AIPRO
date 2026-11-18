# Security Specification — COMMODITY TRADING AI PRO (Phase 1)

## 1. Data Invariants

1. **Identity Isolation (`users/{userId}`)**: A user profile document can only be read, created, or updated by the verified authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **PII Protection**: `email` is stored inside `/users/{userId}`, which strictly denies cross-user `get` and completely disables `list`.
3. **Settings Integrity (`userSettings/{userId}`)**: Terminal and risk preferences belong strictly to `userId == request.auth.uid`, enforce bounded numeric ranges (`accountEquity >= 0`, `0.05 <= riskPercentagePerTrade <= 10`, etc.), and validate enum values (`accountCurrency`, `defaultTradingStyle`, `defaultTimeframe`, `displayTimezone`).
4. **Immutable Audit Trail (`auditLogs/{logId}`)**: Audit logs are append-only (`allow create` only when `userId == request.auth.uid` and `createdAt == request.time`); `update` and `delete` are unconditionally denied. `list` queries are restricted to `resource.data.userId == request.auth.uid`.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time` (server timestamps). `createdAt` and owner UID fields are immutable after creation.
6. **Strict Schema Enforcement**: Every write requires exact allowlisted keys (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update) to block shadow fields and resource exhaustion attacks.
7. **Research Notebook (`researchNotes/{noteId}`, T18)**: Private to the verified owner (`userId == request.auth.uid` for get/list/create/update/delete; list must be scoped by `where('userId', '==', uid)`). Schema: `userId`, `instrumentId` (1–32), `title` (1–120), `body` (≤ 10,000), `tags` (list ≤ 8 of strings 1–32), `chartContext` (`null` or a map with exactly `timeframe` ('' or M1…W1), `contractCode` (≤ 24), `rangeStart`/`rangeEnd` (≤ 40)), `createdAt`/`updatedAt` server timestamps. `userId` and `createdAt` are immutable; updates may only touch `instrumentId`, `title`, `body`, `tags`, `chartContext`, `updatedAt`. Covered by `tests/rules/researchNotes.emulator.test.ts`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Unauthenticated Read on `/users/{uid}`**: `get(/users/userA)` with `auth == null`.
2. **Cross-User PII Read**: `get(/users/userA)` authenticated as `userB`.
3. **User Collection Enumeration**: `list(/users)` authenticated as `userA`.
4. **Unverified Email Write**: `set(/users/userA, ...)` with `auth.uid == 'userA'` and `auth.token.email_verified == false`.
5. **Identity Spoofing on Create**: `set(/userSettings/userA, { userId: 'userB', ... })` authenticated as `userA`.
6. **Shadow Field Injection on Create**: `set(/userSettings/userA, { ..., isAdmin: true })` authenticated as `userA`.
7. **Shadow Field Injection on Update**: `update(/userSettings/userA, { displayTimezone: 'UTC', role: 'superadmin' })`.
8. **Immutable Field Mutation**: `update(/userSettings/userA, { userId: 'userB', updatedAt: serverTimestamp() })`.
9. **Client Timestamp Forgery**: `set(/users/userA, { ..., createdAt: '2020-01-01T00:00:00Z' })`.
10. **Path Variable Poisoning**: `set(/auditLogs/${'a'.repeat(300)}, { ... })` exceeding `isValidId` 128-char / regex constraints.
11. **Risk Limit Out-of-Bounds / Type Poisoning**: `update(/userSettings/userA, { riskPercentagePerTrade: 500, updatedAt: serverTimestamp() })`.
12. **Audit Log Tampering / Deletion**: `update(/auditLogs/log1, ...)` or `delete(/auditLogs/log1)` by the owner.
