# Modrinth-Aware Guidance and Cache Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse corrected MCA/Minecraft answers reliably, validate public release compatibility from a resilient Modrinth cache, improve partial/invalid-answer guidance, and add Administrator-only `/cache status` and `/cache update` commands.

**Architecture:** Preserve the existing raw detector output for exports while adding per-source extraction and latest-wins resolved state for live guidance. A Modrinth service owns normalised catalogue data, atomic disk caching, background refresh, compatibility/latest queries and operational status. The guidance coordinator compares diagnosis fingerprints to edit one main warning, replace one acknowledgement/reminder and prevent stale timer races. A separate cache command handler exposes service status and manual refresh to Administrator members in the configured guild.

**Tech Stack:** Node.js 22+, ECMAScript modules, discord.js 14.27+, built-in `fetch`, `node:fs/promises`, `node:test`, no new runtime dependencies.

## Global Constraints

- Work directly on explicitly authorised branch `master`.
- MCA Reborn Modrinth project ID is `1W98a849`.
- Fetch `https://api.modrinth.com/v2/project/1W98a849/version?include_changelog=false` with the project User-Agent.
- Cache path is `data/modrinth-mca-versions.json`; `data/` must be ignored.
- Cache freshness and automatic refresh cadence are six hours; request timeout is ten seconds.
- Discord replies must never wait for a background catalogue refresh.
- Unknown/unpublished builds are accepted and never rejected only because Modrinth lacks them.
- Known public MCA releases must align with supplied Minecraft version and known loader.
- Latest recommendations must be filtered to the player's Minecraft version and known loader.
- Meaningful owner progress resets the 45-second inactivity timer but preserves scheduled reminder count.
- Ordinary replies and exact repeats do not ping or reset timers.
- Keep at most one main guidance message and one acknowledgement/reminder message.
- `/cache` is guild-only, Administrator-only and runtime-gated to guild `747184859386085380`.
- Existing `/scan export` behaviour and historical raw detector fields remain compatible.

---

### Task 1: Conversation-aware version extraction and resolution

**Files:**
- Create: `src/version/extract.js`
- Create: `src/version/resolve.js`
- Modify: `src/version/detect.js`
- Modify: `test/version-detect.test.js`
- Create: `test/version-resolve.test.js`

**Interfaces:**
- `extractVersionEvidence({ text, source, owner, priority })` returns `{ minecraft, mca, pairs, loaders, vague }`.
- `resolveVersionEvidence(sources)` returns resolved Minecraft, MCA and loader fields plus the authoritative explicit pair.
- `detectThreadVersions(input)` retains raw `minecraft`, `mca`, and `vague` fields and adds `{ sources, resolved, pairs, loader }`.

- [ ] **Step 1: Write failing parser tests**

Add cases asserting:

```js
assert.deepEqual(detect({ messages: [{ content: '7.7.23+26.1.2' }] }).resolved, {
  minecraft: { status: 'present', value: '26.1.2', values: ['26.1.2'] },
  mca: { status: 'present', value: '7.7.23', values: ['7.7.23'] },
  loader: { status: 'missing', value: null, values: [] },
  pair: { mca: '7.7.23', minecraft: '26.1.2', loader: null, source: 'starter', explicit: true },
});
```

Also cover `/`, labelled pairs, JAR pairs, NeoForge spelling, and two pairs in one latest message.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test test/version-detect.test.js test/version-resolve.test.js
```

Expected: failures because resolved fields and informal pairs do not exist.

- [ ] **Step 3: Implement pure extraction**

Implement version-shape helpers, informal-pair extraction, labelled extraction, filename extraction and loader normalisation in `extract.js`. Each source keeps its own values rather than immediately merging all conversation history.

- [ ] **Step 4: Implement latest-wins resolution**

Apply source priority tags < title < starter < owner replies. A latest complete explicit pair sets both fields together. A later single-field answer updates only that field. Multiple current values in one source are ambiguous. Unrelated owner messages have no evidence and do not change resolution.

- [ ] **Step 5: Preserve raw compatibility output**

Adapt `detect.js` so existing raw arrays and evidence remain available to export/tests while live guidance can consume `result.resolved`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the same command and require zero failures.

- [ ] **Step 7: Commit**

```bash
git add src/version test/version-detect.test.js test/version-resolve.test.js
git commit -m "feat: resolve corrected version answers"
```

### Task 2: Modrinth catalogue normalisation and compatibility queries

**Files:**
- Create: `src/modrinth/catalogue.js`
- Create: `test/modrinth-catalogue.test.js`

**Interfaces:**
- `normaliseModrinthVersions(records)` returns immutable normalised entries.
- `checkCompatibility(catalogue, { mcaVersion, minecraftVersion, loader })` returns `verified`, `known-incompatible`, `unknown-build`, or `catalogue-unavailable`.
- `findLatestCompatible(catalogue, { minecraftVersion, loader })` returns a direct recommendation, `loader-required`, or `none`.
- `catalogueStats(catalogue)` returns record/unique-MCA/Minecraft/loader counts.

- [ ] **Step 1: Write failing catalogue tests**

Use synthetic Modrinth records covering suffix stripping, prereleases, statuses, releases/betas/alphas, Minecraft branches and Fabric/NeoForge divergence.

- [ ] **Step 2: Verify RED**

```bash
node --test test/modrinth-catalogue.test.js
```

- [ ] **Step 3: Implement normalisation**

Retain only required fields, lower-case loaders, select the primary filename and strip only Minecraft/loader suffixes that agree with record metadata.

- [ ] **Step 4: Implement compatibility**

A known MCA version that lacks the supplied Minecraft or loader is incompatible. No public entry for the MCA version is `unknown-build`, which remains acceptable.

- [ ] **Step 5: Implement latest selection and stats**

Filter by Minecraft and known loader, prefer release then beta then alpha, and choose newest `date_published`. Without a loader, recommend directly only when every applicable loader resolves to the same latest MCA version; otherwise return `loader-required`.

- [ ] **Step 6: Verify GREEN and commit**

```bash
node --test test/modrinth-catalogue.test.js
git add src/modrinth/catalogue.js test/modrinth-catalogue.test.js
git commit -m "feat: query Modrinth version compatibility"
```

### Task 3: Atomic cache, Modrinth client and refresh service

**Files:**
- Create: `src/modrinth/cache.js`
- Create: `src/modrinth/client.js`
- Create: `src/modrinth/service.js`
- Create: `test/modrinth-cache.test.js`
- Create: `test/modrinth-client.test.js`
- Create: `test/modrinth-service.test.js`
- Modify: `.gitignore`

**Interfaces:**
- `loadCatalogueCache(path)` validates schema and returns cache or `null`.
- `writeCatalogueCache(path, document)` publishes through temp-file rename.
- `createModrinthClient({ fetchImpl, timeoutMs })` exposes `fetchVersions()`.
- `createCatalogueService(dependencies)` exposes `start()`, `stop()`, `refresh({ reason })`, `catalogue()`, `revision()`, and `status()`.

- [ ] **Step 1: Write failing disk-cache tests**

Cover valid/invalid JSON, schema/project validation, atomic rename and six-hour fresh/stale decisions.

- [ ] **Step 2: Write failing client tests**

Assert exact endpoint, `include_changelog=false`, User-Agent, timeout cancellation, response validation, 429 reset metadata, 410 disable metadata and 5xx failure.

- [ ] **Step 3: Write failing service tests**

Cover disk startup, missing/stale background refresh, six-hour scheduling, single-flight manual/automatic refresh, stale-cache preservation, status counts and next-refresh metadata.

- [ ] **Step 4: Verify RED**

```bash
node --test test/modrinth-cache.test.js test/modrinth-client.test.js test/modrinth-service.test.js
```

- [ ] **Step 5: Implement cache and client**

Use `node:fs/promises`, `AbortController`, injected fetch/timers and structured errors with retry/disable metadata.

- [ ] **Step 6: Implement service**

Load disk synchronously during `start()`, expose current catalogue immediately, refresh in the background, serialize refreshes and preserve the prior catalogue on failure.

- [ ] **Step 7: Ignore local runtime data**

Append:

```gitignore
# Modrinth catalogue runtime cache
data/
```

- [ ] **Step 8: Verify GREEN and commit**

```bash
node --test test/modrinth-cache.test.js test/modrinth-client.test.js test/modrinth-service.test.js
git add src/modrinth test/modrinth-*.test.js .gitignore
git commit -m "feat: cache the Modrinth MCA catalogue"
```

### Task 4: Catalogue-aware policy and helpful message rendering

**Files:**
- Modify: `src/guidance/policy.js`
- Modify: `src/guidance/messages.js`
- Modify: `test/guidance-policy.test.js`
- Modify: `test/guidance-messages.test.js`

**Interfaces:**
- `diagnoseVersions(result, catalogue)` returns completion, compatibility, recommendation, fingerprint and dynamic help fields.
- `buildProgressAcknowledgement({ ownerId, diagnosis, messageId, invalidAttemptCount })` builds the single secondary progress response.
- Existing main/reminder/info builders accept catalogue-aware diagnosis data.

- [ ] **Step 1: Write failing diagnosis tests**

Cover verified, incompatible Minecraft, incompatible loader, unknown build accepted, catalogue unavailable, loader-required recommendation and resolved latest-pair usage.

- [ ] **Step 2: Write failing message tests**

Assert accepted-value acknowledgements, current missing field, direct compatible Modrinth link, loader question, full-JAR/screenshot/log escalation and non-shaming language.

- [ ] **Step 3: Verify RED**

```bash
node --test test/guidance-policy.test.js test/guidance-messages.test.js
```

- [ ] **Step 4: Implement policy and builders**

Use resolved values. Known incompatibility remains incomplete. Unknown build and unavailable catalogue complete via syntax. Include latest compatible recommendation only for the supplied Minecraft branch and loader.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test test/guidance-policy.test.js test/guidance-messages.test.js
git add src/guidance/policy.js src/guidance/messages.js test/guidance-policy.test.js test/guidance-messages.test.js
git commit -m "feat: explain incompatible and partial versions"
```

### Task 5: Meaningful-progress coordinator and race-safe timers

**Files:**
- Modify: `src/guidance/coordinator.js`
- Modify: `src/guidance/discord-adapter.js`
- Modify: `src/guidance/runtime.js`
- Modify: `test/guidance-coordinator.test.js`
- Modify: `test/guidance-discord-adapter.test.js`
- Modify: `test/guidance-runtime.test.js`

**Interfaces:**
- Coordinator accepts `catalogueService`.
- Adapter adds `editMessage(threadId, messageId, payload)`.
- Coordinator adds owner evidence rechecks for message create/update/delete while actively tracked.

- [ ] **Step 1: Write failing state-machine tests**

Cover immediate acknowledgement for `26.1.2`, main-warning edit, secondary replacement, timer reset, preserved reminder count, no action for `h`, latest-pair completion, incompatible-pair help, escalation count and stale timer generations.

- [ ] **Step 2: Add runtime/adapter RED tests**

Cover message update/delete routing and edit fallback behaviour.

- [ ] **Step 3: Verify RED**

```bash
node --test test/guidance-coordinator.test.js test/guidance-discord-adapter.test.js test/guidance-runtime.test.js
```

- [ ] **Step 4: Implement fingerprint state**

Store `lastDiagnosisFingerprint`, `invalidAttemptCount`, `timerGeneration`, `responseId` and reminder count. Increment invalid attempts only for distinct incomplete diagnosis changes.

- [ ] **Step 5: Implement progress lifecycle**

On meaningful progress, invalidate the timer, edit/replace main guidance, delete old secondary, send one acknowledgement replying to the latest owner message and schedule another inactivity check only when fewer than two timed reminders were sent.

- [ ] **Step 6: Implement stale-callback protection and routing**

Timer callbacks compare captured generation before reading/sending. Owner edits/deletions recheck only actively tracked threads; completed workflows are not reopened.

- [ ] **Step 7: Verify GREEN and commit**

```bash
node --test test/guidance-coordinator.test.js test/guidance-discord-adapter.test.js test/guidance-runtime.test.js
git add src/guidance test/guidance-*.test.js
git commit -m "feat: respond to meaningful version progress"
```

### Task 6: Administrator cache commands

**Files:**
- Create: `src/discord/cache-command.js`
- Create: `src/discord/cache-handler.js`
- Create: `test/cache-command.test.js`
- Create: `test/cache-handler.test.js`

**Interfaces:**
- `cacheCommandData` is a guild-context Administrator command with `status` and `update` subcommands.
- `createCacheInteractionHandler({ config, catalogueService, now })` returns an interaction handler.

- [ ] **Step 1: Write failing command metadata tests**

Assert command name/subcommands, guild-only context and Administrator default permission.

- [ ] **Step 2: Write failing handler tests**

Cover configured-guild Administrator success, DM/other-guild/non-admin denial, unavailable/disk/network/stale/refreshing status, update success/failure and joined concurrent refresh.

- [ ] **Step 3: Verify RED**

```bash
node --test test/cache-command.test.js test/cache-handler.test.js
```

- [ ] **Step 4: Implement command and handler**

Use ephemeral responses. Status wording says `Modrinth version records indexed` and includes unique MCA/Minecraft/loader counts and timestamps. Update defers, awaits `refresh({ reason: 'manual' })`, then reports whether revision changed.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test test/cache-command.test.js test/cache-handler.test.js
git add src/discord/cache-* test/cache-*.test.js
git commit -m "feat: add administrator cache commands"
```

### Task 7: Runtime integration, documentation and complete verification

**Files:**
- Modify: `src/index.js`
- Modify: `README.md`
- Modify: `test/handler.test.js` only if command composition requires fixture updates

**Interfaces:**
- Start catalogue service before live guidance uses it.
- Register global `/scan` and guild-scoped `/cache` commands.
- Route cache interactions before scan interactions.
- Stop catalogue timers during SIGINT/SIGTERM shutdown.

- [ ] **Step 1: Update runtime wiring**

Create client/service, `await catalogueService.start()`, inject service into guidance and cache handler, register cache in the allowed guild and preserve `/scan export` registration.

- [ ] **Step 2: Update README**

Document cache directory, automatic six-hour refresh, compatibility behaviour, unknown-build fallback, partial-answer acknowledgement and Administrator cache commands.

- [ ] **Step 3: Run complete tests**

```bash
npm test
```

Require zero failures.

- [ ] **Step 4: Run syntax checks**

```bash
npm run check
```

Require zero syntax errors.

- [ ] **Step 5: Review scope and secrets**

Confirm only planned files changed; `.env`, exports and `data/` remain ignored; no cache payload or token is committed.

- [ ] **Step 6: Commit**

```bash
git add src/index.js README.md test/handler.test.js
git commit -m "feat: enable Modrinth-aware live guidance"
```

## Final verification

- [ ] Confirm `7.7.23+26.1.2` parses as one explicit pair.
- [ ] Confirm a later corrected pair supersedes earlier answers.
- [ ] Confirm a publicly known incompatible pair remains incomplete and receives a branch/loader-correct Modrinth recommendation.
- [ ] Confirm an unknown build completes without rejection.
- [ ] Confirm `/cache status` and `/cache update` reject non-admins and other guilds.
- [ ] Confirm the status output includes indexed record count and last successful refresh time.
- [ ] Confirm all existing scan/export tests pass.
