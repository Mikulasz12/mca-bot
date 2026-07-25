# MCA Live Version Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immediate, low-noise version guidance to new MCA support threads, with one persistent warning, up to two replaceable 45-second reminders, automatic cleanup, and an `info` help keyword.

**Architecture:** Keep the existing detector as the source of truth. Add pure policy and message builders, a Discord thread reader/adapter, and a timer-driven coordinator with injected clock/timer dependencies for deterministic tests. Route `threadCreate`, `threadUpdate`, `threadDelete`, and `messageCreate` from `src/index.js` without changing `/scan export`.

**Tech Stack:** Node.js 22+, ECMAScript modules, discord.js 14.27+, built-in `node:test`, no new runtime dependencies.

## Global Constraints

- Only configured forum channels `1082779790714613840` and `1131690144160825455` are monitored.
- Validate thread title, applied tags, starter post, and later thread-owner messages/attachment filenames only.
- A thread is complete only with exactly one Minecraft version and exactly one MCA Reborn version.
- Send the initial warning immediately after the starter becomes available; no grace period.
- Ping only the thread owner and disable role/everyone mentions.
- Send at most two reminders, 45 seconds apart, deleting the previous reminder before replacement.
- Delete the main warning and current reminder once the thread becomes complete.
- `info` is standalone and case-insensitive; non-moderators have a per-user/per-thread 60-second cooldown; Manage Messages bypasses it.
- Logs are optional and recommended only for crashes, bugs, loading failures, and technical problems.
- User-facing text must not require a fixed response format or mention RC as required.
- No database, restart recovery, AI calls, automatic locking, archiving, or user-message deletion.

---

## File map

- Create `src/guidance/policy.js`: convert detector output into completion and explanation data.
- Create `src/guidance/messages.js`: build Discord payloads for the main warning, reminders, and `info` help.
- Create `src/guidance/thread-reader.js`: fetch starter/tags/owner messages and map them into detector input.
- Create `src/guidance/coordinator.js`: own active-thread state, timer scheduling, reminder replacement, and cleanup.
- Create `src/guidance/info-handler.js`: recognise `info`, enforce cooldowns, and send detailed help.
- Modify `src/index.js`: add gateway intent and event routing.
- Modify `README.md`: document live guidance permissions and behaviour.
- Create tests under `test/guidance-*.test.js`.

### Task 1: Guidance policy and message payloads

**Files:**
- Create: `src/guidance/policy.js`
- Create: `src/guidance/messages.js`
- Test: `test/guidance-policy.test.js`
- Test: `test/guidance-messages.test.js`

**Interfaces:**
- Produces `diagnoseVersions(result)` returning `{ complete, missing, detected, reasons }`.
- Produces `buildMainWarning({ ownerId, diagnosis })`, `buildReminder({ ownerId, diagnosis })`, and `buildInfoReply({ messageId })`.

- [ ] Write failing tests for complete, missing, ambiguous, rejected-MCA, and vague-version cases.
- [ ] Run `node --test test/guidance-policy.test.js` and verify failures are caused by missing modules/functions.
- [ ] Implement `diagnoseVersions` minimally using detector statuses, values, rejected items, and vague words.
- [ ] Run the policy tests and verify they pass.
- [ ] Write failing payload tests asserting owner-only allowed mentions, dynamic fields, no fixed response template, no RC requirement copy, optional log guidance, and the exact `info` prompt.
- [ ] Run `node --test test/guidance-messages.test.js` and verify RED.
- [ ] Implement plain Discord-compatible embed payload builders.
- [ ] Run both guidance test files and verify GREEN.
- [ ] Commit with `feat: add dynamic guidance messages`.

### Task 2: Discord thread reader

**Files:**
- Create: `src/guidance/thread-reader.js`
- Test: `test/guidance-thread-reader.test.js`

**Interfaces:**
- Produces `createThreadReader({ forumChannelIds, sleep })`.
- `reader.read(thread)` returns `{ threadId, ownerId, starterId, archived, locked, detectorInput }`.

- [ ] Write failing tests for configured-forum filtering, bounded starter retry, tag mapping, owner-only message filtering, attachment names, and bot/other-user exclusion.
- [ ] Run `node --test test/guidance-thread-reader.test.js` and verify RED.
- [ ] Implement starter fetch with three attempts and injected sleep.
- [ ] Fetch up to 100 recent thread messages, retain starter plus thread-owner messages, and map them to `detectThreadVersions` input.
- [ ] Run reader tests and verify GREEN.
- [ ] Commit with `feat: read live support thread evidence`.

### Task 3: Reminder coordinator

**Files:**
- Create: `src/guidance/coordinator.js`
- Test: `test/guidance-coordinator.test.js`

**Interfaces:**
- Produces `createGuidanceCoordinator({ reader, adapter, setTimer, clearTimer, reminderDelayMs, logger })`.
- Public methods: `start(thread)`, `onOwnerMessage(message)`, `onThreadUpdate(oldThread, newThread)`, `onThreadDelete(thread)`, `stop(threadId)`.
- Adapter methods: `sendMain(thread, snapshot, payload)`, `sendReminder(thread, snapshot, payload)`, `deleteMessage(threadId, messageId)`.

- [ ] Write failing tests for complete-thread silence, immediate warning, one timer at 45 seconds, first reminder, deletion-before-second-reminder, two-reminder maximum, owner-message immediate completion, warning/reminder cleanup, archived/locked stop, and thread deletion.
- [ ] Run `node --test test/guidance-coordinator.test.js` and verify RED.
- [ ] Implement one `Map` entry per active thread with warning ID, reminder ID, reminder count, timer handle, and owner ID.
- [ ] Inject timer functions so tests manually trigger callbacks without waiting.
- [ ] Treat unknown-message deletion as non-fatal and isolate failures to the affected thread.
- [ ] Run coordinator tests and verify GREEN.
- [ ] Commit with `feat: coordinate live guidance reminders`.

### Task 4: `info` keyword and Discord adapter

**Files:**
- Create: `src/guidance/info-handler.js`
- Create: `src/guidance/discord-adapter.js`
- Test: `test/guidance-info-handler.test.js`
- Test: `test/guidance-discord-adapter.test.js`

**Interfaces:**
- Produces `createInfoHandler({ forumChannelIds, now, cooldownMs })` with `handle(message, adapter)`.
- Produces `createGuidanceDiscordAdapter(client)` implementing coordinator adapter methods plus `sendInfo(message, payload)`.

- [ ] Write failing tests for standalone/case-insensitive `info`, bot/DM/other-forum rejection, per-user/per-thread cooldown, silent cooldown denial, and Manage Messages bypass.
- [ ] Run info tests and verify RED.
- [ ] Implement cooldown storage keyed by `${threadId}:${userId}` and lazy expiry.
- [ ] Write failing adapter tests for replying to the starter, owner-only allowed mentions, sending/deleting messages, and safe missing-message deletion.
- [ ] Run adapter tests and verify RED.
- [ ] Implement Discord operations using thread/message APIs and `PermissionsBitField.Flags.ManageMessages`.
- [ ] Run both test files and verify GREEN.
- [ ] Commit with `feat: add info help and discord guidance adapter`.

### Task 5: Runtime integration and documentation

**Files:**
- Modify: `src/index.js`
- Modify: `README.md`
- Test: `test/guidance-runtime.test.js`

**Interfaces:**
- Runtime registers `Events.ThreadCreate`, `Events.ThreadUpdate`, `Events.ThreadDelete`, and `Events.MessageCreate`.
- Existing `Events.InteractionCreate` remains unchanged except the fallback response uses `MessageFlags.Ephemeral`.

- [ ] Write a failing runtime wiring test around an extracted `registerGuidanceEvents(client, dependencies)` function.
- [ ] Run `node --test test/guidance-runtime.test.js` and verify RED.
- [ ] Add `GatewayIntentBits.GuildMessages`, instantiate reader/adapter/coordinator/info handler, and route events.
- [ ] Ensure owner messages trigger coordinator rechecks and every human `info` message is offered to the info handler.
- [ ] Update README permissions and live behaviour, including `latest.log` locations and `mclo.gs`.
- [ ] Run `npm test` and `npm run check`.
- [ ] Verify no existing `/scan export` tests regress.
- [ ] Commit with `feat: enable live support thread guidance`.

## Final verification

- [ ] Run `npm install --ignore-scripts`.
- [ ] Run `npm test`; require zero failures.
- [ ] Run `npm run check`; require zero syntax errors.
- [ ] Review the final diff for unrelated changes and secret material.
- [ ] Confirm the bot token, exports, and local logs remain ignored.
