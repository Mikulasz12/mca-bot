# Guidance Priority, Deleted Threads, and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make forum tags authoritative, exclude three non-MCA help categories, stop silently on deleted Discord resources, and perform a focused four-lens cleanup.

**Architecture:** Keep tag filtering in the thread reader so excluded threads avoid Discord message I/O. Carry forum-tag evidence into the version resolver as a locked authoritative field rather than relying on source ordering. Centralise Discord missing-resource classification so the reader, coordinator, and adapter share the same terminal-deletion semantics.

**Tech Stack:** Node.js 22, ESM, discord.js 14.27, node:test.

## Global Constraints

- Work directly toward `master`, as explicitly requested.
- Preserve `/scan export` behaviour.
- Do not add dependencies.
- Excluded tags are exactly `Server Help`, `Non-MCA Help`, and `Translation Help`, matched case-insensitively after trimming.
- `MCA <version>` forum tags are authoritative for Minecraft version.
- Unknown Message (`10008`) and Unknown Channel (`10003`) are silent terminal disappearance signals.
- Behaviour changes require RED→GREEN tests before production edits.

---

### Task 1: Excluded tags at the read boundary

**Files:**
- Modify: `src/guidance/thread-reader.js`
- Modify: `src/guidance/info-handler.js` if it independently handles excluded threads
- Test: `test/guidance-thread-reader.test.js`
- Test: `test/guidance-info-handler.test.js`

**Interfaces:**
- Produces: a shared `isExcludedSupportThread(thread)` or equivalent pure helper used before starter/message reads.

- [ ] Add failing tests proving each excluded tag returns `null` without calling `fetchStarterMessage()` or `messages.fetch()`.
- [ ] Add a failing test proving matching is case-insensitive and exclusion wins when an MCA version tag is also present.
- [ ] Implement the smallest shared exclusion helper and apply it before I/O.
- [ ] Run the focused thread-reader/info tests.

### Task 2: Authoritative forum Minecraft tags

**Files:**
- Modify: `src/version/extract.js`
- Modify: `src/version/resolve.js`
- Modify: `src/version/detect.js`
- Test: `test/version-resolve.test.js`
- Test: `test/version-detect.test.js`

**Interfaces:**
- Consumes: tag evidence marked as authoritative for the Minecraft field.
- Produces: `resolved.minecraft` selected from forum tags whenever at least one valid tag exists; multiple distinct tag values produce ambiguity.

- [ ] Add failing tests for tag-over-title and tag-over-owner-reply conflicts.
- [ ] Add a failing test for multiple conflicting `MCA <version>` tags.
- [ ] Mark forum-tag Minecraft evidence authoritative and resolve it before conversational field updates.
- [ ] Preserve title/reply MCA and loader resolution.
- [ ] Run focused version tests.

### Task 3: Silent deleted-resource handling

**Files:**
- Create or modify: `src/guidance/discord-errors.js`
- Modify: `src/guidance/thread-reader.js`
- Modify: `src/guidance/coordinator.js`
- Modify: `src/guidance/discord-adapter.js`
- Test: `test/guidance-thread-reader.test.js`
- Test: `test/guidance-coordinator.test.js`
- Test: `test/guidance-discord-adapter.test.js`

**Interfaces:**
- Produces: `isMissingDiscordResource(error): boolean` recognising API codes `10008` and `10003` through direct and nested error shapes.
- Reader preserves the short starter race retry for Unknown Message, then propagates the final missing-resource error.
- Coordinator stops tracking without cleanup/logging when the resource remains missing.

- [ ] Add failing classifier tests for direct, raw, and nested Discord error codes.
- [ ] Add failing reader test proving Unknown Message uses only the bounded starter race retry window.
- [ ] Add failing coordinator tests proving deleted-resource read and cleanup failures are silent while unexpected failures still log.
- [ ] Implement shared classification and terminal handling.
- [ ] Run focused guidance tests.

### Task 4: Adapted four-lens cleanup

**Files:**
- Review all `src/**/*.js` and affected tests.
- Modify only files with high-confidence findings.

**Interfaces:**
- Preserve all public module exports unless a test-backed consolidation updates every caller.

- [ ] Reuse review: identify duplicate Discord-error, collection, normalisation, or cache-state helpers.
- [ ] Quality review: identify redundant state, misleading names/messages, parameter sprawl, and duplicate pipelines.
- [ ] Correctness review: inspect timer invalidation, async error paths, cache refresh single-flight, permissions, and deleted resources.
- [ ] Efficiency review: inspect repeated regex compilation, catalogue scans, Discord fetches, and no-op updates.
- [ ] Apply only findings with direct tests or obvious behaviour-preserving simplifications.
- [ ] Fix the incomplete runtime event fixture so tests represent all registered events.

### Task 5: Verification and publication

**Files:**
- Update: `README.md` only if user-visible behaviour changed and is undocumented.

- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run check` and require zero failures.
- [ ] Inspect the final diff for secrets, generated cache files, archives, or unrelated changes.
- [ ] Commit the spec, plan, source, tests, and any documentation as focused commits or one verified atomic commit.
- [ ] Fast-forward `master` without force.
