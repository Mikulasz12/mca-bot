# MCA Discord Scan Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local discord.js bot with one owner-only `/scan export` command that exports two forums' existing threads, starter posts, and first five replies to a safe JSONL file.

**Architecture:** Keep Discord gateway code thin and place configuration, authorization, pagination, message selection, redaction, and JSONL writing in small dependency-free modules. The command handler injects Discord adapters into the tested core scan service, processes threads sequentially, and atomically publishes one export file.

**Tech Stack:** Node.js 22+, ECMAScript modules, discord.js 14.16.3, Node built-in `node:test`, npm.

## Global Constraints

- Expose exactly one application command: `/scan export`.
- Owner user ID is `245983842672967680`.
- Allowed guild ID is `747184859386085380`.
- Scan forum channel IDs `1082779790714613840` and `1131690144160825455` only.
- Read the starter message and first five chronological replies.
- Produce one timestamped JSONL file under `exports/`.
- Do not warn users or modify Discord threads.
- Do not download attachments.
- Do not call external AI services.
- Keep `SCAN_EXPORT_ROLE_IDS` empty by default as the future role extension point.

---

## File map

- `package.json`: runtime metadata and scripts.
- `.env.example`: token and fixed Discord ID configuration.
- `src/config.js`: parse and validate environment configuration.
- `src/access.js`: authorize owner DM and allowed-guild interactions.
- `src/scan/collect-threads.js`: collect and deduplicate active and archived threads.
- `src/scan/select-messages.js`: select starter plus first five chronological replies.
- `src/export/redact.js`: redact token-like secrets and webhook URLs.
- `src/export/record.js`: convert Discord-like objects to stable plain export records.
- `src/export/jsonl-writer.js`: atomic JSONL output.
- `src/discord/command.js`: build `/scan export` command metadata.
- `src/discord/scan-adapter.js`: discord.js channel, thread, tag, and message adapter.
- `src/discord/handler.js`: single-command orchestration and response handling.
- `src/index.js`: load environment, create client, register command, and route interactions.
- `test/*.test.js`: dependency-free unit tests.
- `README.md`: Developer Portal, install, run, and export instructions.

---

### Task 1: Configuration and authorization core

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `src/config.js`
- Create: `src/access.js`
- Test: `test/config.test.js`
- Test: `test/access.test.js`

**Interfaces:**
- Produces: `loadConfig(env)` returning `{ token, ownerUserId, allowedGuildId, forumChannelIds, scanExportRoleIds, exportDir }`.
- Produces: `authorizeScanExport(input, config)` returning `{ allowed, reason }`.

- [ ] **Step 1: Write failing configuration tests**

Test valid fixed IDs, comma-separated role IDs, a missing token, and malformed snowflakes.

- [ ] **Step 2: Run configuration tests and verify RED**

Run: `node --test test/config.test.js`
Expected: FAIL because `src/config.js` does not exist.

- [ ] **Step 3: Implement minimal configuration parsing**

Use `assertSnowflake`, `splitCsv`, and `loadConfig`. Default the non-secret IDs to the approved values and require `DISCORD_TOKEN`.

- [ ] **Step 4: Run configuration tests and verify GREEN**

Run: `node --test test/config.test.js`
Expected: all configuration tests pass.

- [ ] **Step 5: Write failing authorization tests**

Cover owner DM, other-user DM, owner in allowed guild, owner in wrong guild, allowed role in allowed guild, and role in wrong guild.

- [ ] **Step 6: Run authorization tests and verify RED**

Run: `node --test test/access.test.js`
Expected: FAIL because `src/access.js` does not exist.

- [ ] **Step 7: Implement minimal authorization**

DM access is owner-only. Guild access requires the allowed guild and either the owner ID or one configured role ID.

- [ ] **Step 8: Run task tests and verify GREEN**

Run: `node --test test/config.test.js test/access.test.js`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add package.json .env.example src/config.js src/access.js test/config.test.js test/access.test.js
git commit -m "feat: add scan export configuration and access control"
```

### Task 2: Thread collection and message selection

**Files:**
- Create: `src/scan/collect-threads.js`
- Create: `src/scan/select-messages.js`
- Test: `test/collect-threads.test.js`
- Test: `test/select-messages.test.js`

**Interfaces:**
- Produces: `collectThreads({ fetchActive, fetchArchived })` returning an array of unique thread objects.
- Produces: `selectStarterAndReplies(starter, messages, replyLimit = 5)` returning `{ starter, replies }`.

- [ ] **Step 1: Write failing thread collection tests**

Cover active-thread inclusion, archived pagination, ID deduplication, empty final page, and repeated-cursor termination.

- [ ] **Step 2: Run collection tests and verify RED**

Run: `node --test test/collect-threads.test.js`
Expected: FAIL because `collectThreads` is missing.

- [ ] **Step 3: Implement minimal thread collection**

Fetch active threads once. Repeatedly fetch archived pages with `{ before }`, append unseen IDs, use the oldest archived thread as the next cursor, and stop on `hasMore === false`, an empty page, or an unchanged cursor.

- [ ] **Step 4: Run collection tests and verify GREEN**

Run: `node --test test/collect-threads.test.js`
Expected: all collection tests pass.

- [ ] **Step 5: Write failing message selection tests**

Cover unsorted input, starter removal, first-five truncation, fewer than five replies, and snowflake-string ordering.

- [ ] **Step 6: Run selection tests and verify RED**

Run: `node --test test/select-messages.test.js`
Expected: FAIL because `selectStarterAndReplies` is missing.

- [ ] **Step 7: Implement minimal message selection**

Sort by `BigInt(message.id)`, remove the starter ID, and retain at most five earliest replies.

- [ ] **Step 8: Run task tests and verify GREEN**

Run: `node --test test/collect-threads.test.js test/select-messages.test.js`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/scan test/collect-threads.test.js test/select-messages.test.js
git commit -m "feat: collect forum threads and select early replies"
```

### Task 3: Safe export records and atomic JSONL writing

**Files:**
- Create: `src/export/redact.js`
- Create: `src/export/record.js`
- Create: `src/export/jsonl-writer.js`
- Test: `test/redact.test.js`
- Test: `test/record.test.js`
- Test: `test/jsonl-writer.test.js`

**Interfaces:**
- Produces: `redactSensitiveText(text)` returning a string.
- Produces: `createThreadRecord(input)` returning a JSON-serializable object with `schemaVersion: 1`.
- Produces: `createAtomicJsonlWriter({ exportDir, now })` returning `{ outputPath, append(record), commit(), abort() }`.

- [ ] **Step 1: Write failing redaction tests**

Cover Discord webhook URLs, token-like three-part secrets, and preservation of Minecraft/MCA versions.

- [ ] **Step 2: Run redaction tests and verify RED**

Run: `node --test test/redact.test.js`
Expected: FAIL because the redactor is missing.

- [ ] **Step 3: Implement minimal redaction**

Replace webhook URLs with `[REDACTED_DISCORD_WEBHOOK]` and token-like strings with `[REDACTED_DISCORD_TOKEN]`.

- [ ] **Step 4: Run redaction tests and verify GREEN**

Run: `node --test test/redact.test.js`
Expected: all redaction tests pass.

- [ ] **Step 5: Write failing record tests**

Verify tag mapping, author-kind classification, attachment metadata, content redaction, no raw author ID field, and stable positions.

- [ ] **Step 6: Run record tests and verify RED**

Run: `node --test test/record.test.js`
Expected: FAIL because the record builder is missing.

- [ ] **Step 7: Implement minimal record creation**

Create plain objects only. Classify authors against `thread.ownerId` and `author.bot`; omit raw user IDs.

- [ ] **Step 8: Run record tests and verify GREEN**

Run: `node --test test/record.test.js`
Expected: all record tests pass.

- [ ] **Step 9: Write failing writer tests**

Use a temporary directory to verify timestamped filenames, one-object-per-line output, atomic rename on commit, and temporary-file deletion on abort.

- [ ] **Step 10: Run writer tests and verify RED**

Run: `node --test test/jsonl-writer.test.js`
Expected: FAIL because the writer is missing.

- [ ] **Step 11: Implement minimal atomic writer**

Create the export directory, open a `.tmp` file, append serialized records with a newline, close and rename on commit, and close/unlink on abort.

- [ ] **Step 12: Run task tests and verify GREEN**

Run: `node --test test/redact.test.js test/record.test.js test/jsonl-writer.test.js`
Expected: all tests pass.

- [ ] **Step 13: Commit**

```bash
git add src/export test/redact.test.js test/record.test.js test/jsonl-writer.test.js
git commit -m "feat: create safe atomic JSONL exports"
```

### Task 4: discord.js adapter and one-command orchestration

**Files:**
- Create: `src/discord/command.js`
- Create: `src/discord/scan-adapter.js`
- Create: `src/discord/handler.js`
- Create: `src/index.js`
- Test: `test/handler.test.js`

**Interfaces:**
- Consumes: `loadConfig`, `authorizeScanExport`, `collectThreads`, `selectStarterAndReplies`, `createThreadRecord`, and `createAtomicJsonlWriter`.
- Produces: `scanCommandData`.
- Produces: `createScanAdapter(client, config)`.
- Produces: `createInteractionHandler({ config, adapter, writerFactory })`.

- [ ] **Step 1: Write failing handler tests**

Use plain fake interactions and injected adapters to cover unauthorized rejection, unrelated-command ignore, single-scan lock, successful export summary, per-thread non-fatal errors, fatal channel failure with writer abort, and attachment upload fallback.

- [ ] **Step 2: Run handler tests and verify RED**

Run: `node --test test/handler.test.js`
Expected: FAIL because the handler is missing.

- [ ] **Step 3: Implement the minimal handler**

Authorize before scanning, defer the response, process configured forums sequentially, append records, commit once, and attempt the attachment response. Keep an in-process boolean lock.

- [ ] **Step 4: Run handler tests and verify GREEN**

Run: `node --test test/handler.test.js`
Expected: all handler tests pass.

- [ ] **Step 5: Implement command metadata and Discord adapter**

Build `/scan export` with guild and bot-DM contexts. Adapt discord.js collections to arrays, resolve tag names from `availableTags`, fetch starter messages, fetch a six-message window around the starter, and return plain values to the handler.

- [ ] **Step 6: Implement the entry point**

Load `.env` through `process.loadEnvFile`, validate config, create a client with Guilds and MessageContent intents, register the global command on ready, and route `interactionCreate` to the handler.

- [ ] **Step 7: Run all tests and syntax checks**

Run:

```bash
npm test
npm run check
```

Expected: all tests pass and every source file parses.

- [ ] **Step 8: Commit**

```bash
git add src/discord src/index.js test/handler.test.js
git commit -m "feat: add owner-only scan export command"
```

### Task 5: Documentation, ignore rules, and final verification

**Files:**
- Modify: `.gitignore`
- Create: `README.md`
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Documents the complete local setup and operation of `/scan export`.

- [ ] **Step 1: Update ignore rules**

Ignore `exports/` while retaining `.env.example`.

- [ ] **Step 2: Write setup documentation**

Document Discord Developer Portal intents, OAuth scopes and permissions, `.env` creation, `npm install`, `npm start`, command registration behavior, local export location, and the instruction to upload the resulting JSONL file for matcher analysis.

- [ ] **Step 3: Add CI**

Run `npm ci`, `npm test`, and `npm run check` on pushes and pull requests using Node.js 22.

- [ ] **Step 4: Run final verification**

Run:

```bash
npm test
npm run check
```

Expected: all tests pass with no warnings and source syntax checks succeed.

- [ ] **Step 5: Commit**

```bash
git add .gitignore README.md .github/workflows/test.yml
git commit -m "docs: add local bot setup and CI"
```
