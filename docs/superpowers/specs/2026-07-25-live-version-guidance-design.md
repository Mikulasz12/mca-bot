# MCA Live Version Guidance Design

## Goal

Add live support-thread guidance to the existing local Discord bot. New threads in the two configured MCA support forums are checked immediately for exact Minecraft and MCA Reborn versions. Incomplete threads receive one clear dynamic warning, up to two replaceable reminder pings, and optional detailed help through a thread-local `info` keyword.

The feature must remain polite, low-noise, deterministic, and easy to remove once the thread owner supplies valid information.

## Scope

This feature applies only to threads whose parent channel ID is one of:

- `1082779790714613840`
- `1131690144160825455`

It does not change `/scan export`, lock threads, archive threads, edit user messages, or require logs for every request.

## Events and permissions

The bot listens for:

- `threadCreate` to validate a new forum thread as soon as its starter message is available.
- `messageCreate` to process later owner replies and the standalone `info` keyword.

The client adds the `GuildMessages` gateway intent alongside the existing `Guilds` and `MessageContent` intents.

Required bot permissions in the configured forums and their threads:

- View Channel
- Read Message History
- Send Messages in Threads
- Embed Links

The bot deletes only messages it authored, so Manage Messages is not required for cleanup. The user permission check for the `info` cooldown uses the member's effective Manage Messages permission.

## Version validation policy

The existing `detectThreadVersions` function remains the source of truth.

Validation input consists of:

- Thread title
- Applied forum tags
- Starter post
- Later messages authored by the thread owner only
- Attachment filenames from those owner messages

Messages from moderators, other users, and bots are excluded from completion evidence so staff questions, examples, or bot guidance cannot accidentally satisfy the requirement.

A thread is complete only when:

- Exactly one Minecraft version is present, and
- Exactly one MCA Reborn version is present

`missing` and `ambiguous` detector statuses are incomplete. Minecraft-shaped values supplied as MCA remain rejected. Words such as `latest` or `newest` do not count as exact versions unless valid exact versions are also present.

The parser may continue accepting prerelease values such as alpha, beta, or RC, but user-facing guidance will not mention RC as a requirement.

## Initial warning

When `threadCreate` fires, the bot immediately attempts to fetch the starter message. A short internal retry handles Discord eventual consistency, but there is no intentional grace period.

If the thread is already complete, the bot sends nothing.

If incomplete, the bot replies directly to the starter message and explicitly mentions the thread owner. Allowed mentions are restricted to that single user, with role and everyone mentions disabled.

The main warning remains visible until the thread becomes complete.

### Main warning structure

Content:

- One explicit mention of the thread owner.

Embed title:

- `⚠️ More version information is needed`

Embed body and fields are generated from the detector result:

- `Missing or unclear`: the exact information still needed.
- `Already detected`: any single valid Minecraft or MCA values already found.
- `Why`: a concise dynamic explanation.
- `Where to look`: the installed mod list or MCA JAR filename, with a non-prescriptive example such as `mca-neoforge-7.7.23+1.21.1.jar`.
- `Technical problems`: for crashes, bugs, loading failures, or other technical problems, recommend attaching `latest.log` or sharing an `mclo.gs` link. Logs are explicitly optional rather than a general requirement.
- Final line: `For more information, type info in this thread.`

The warning does not require a fixed response template and does not tell users they must use a particular format.

### Dynamic explanations

The renderer distinguishes at least these cases:

- Both versions missing.
- Minecraft present and MCA missing.
- MCA present and Minecraft missing.
- A Minecraft-shaped value was supplied as MCA.
- Multiple Minecraft versions found.
- Multiple MCA versions found.
- `latest`, `newest`, or `current` used without an exact value.

If several conditions apply, the embed combines them without duplicating instructions.

## Reminder state machine

Each incomplete thread has process-local state:

- Main warning message ID
- Current reminder message ID, if any
- Reminder count
- Pending timer handle
- Thread owner ID

After the main warning:

1. Wait 45 seconds.
2. Re-fetch thread owner messages and re-run detection.
3. If complete, clean up and stop.
4. If incomplete, send reminder 1 as a direct reply/mention.
5. Wait another 45 seconds.
6. Re-check.
7. If complete, clean up and stop.
8. If incomplete, delete reminder 1, send reminder 2, and stop scheduling further reminders.

Only one reminder message may exist at a time. Before sending a replacement reminder, the previous reminder is deleted.

Reminder text is short and dynamic, mentioning only the remaining problem. It pings only the thread owner.

## Completion cleanup

Every new thread-owner message triggers an immediate re-check in addition to the scheduled checks.

When the thread becomes complete:

- Cancel the pending timer.
- Delete the main warning message.
- Delete the current reminder message, if one exists.
- Remove the thread from active state.

Missing or already-deleted bot messages are ignored during cleanup.

If the thread is deleted, becomes unavailable, or the bot loses access, stop tracking it and log the error. If it becomes archived or locked before completion, stop further reminders and attempt to remove tracked bot guidance where possible.

State is intentionally process-local for this first version. Restarting the bot cancels pending reminders; the feature does not retroactively scan old threads on startup.

## `info` help keyword

A message qualifies when:

- It is in a configured forum thread.
- Its trimmed content equals `info`, case-insensitively.
- It was written by a human user.

The bot replies directly to that message with a detailed help embed.

### Help contents

The help embed explains:

- Minecraft version and MCA Reborn version are different values.
- MCA versions can be found in the launcher mod list, profile's `mods` folder, or MCA JAR filename.
- In a filename such as `mca-neoforge-7.7.23+1.21.1.jar`, `7.7.23` is MCA and `1.21.1` is Minecraft.
- `latest` and `newest` are not exact versions.
- Logs are useful for crashes, bugs, loading failures, and other technical problems but are not mandatory for every help request.
- The relevant file is `logs/latest.log`.
- Default Windows path: `%appdata%\.minecraft\logs\latest.log`.
- Linux path: `~/.minecraft/logs/latest.log`.
- macOS path: `~/Library/Application Support/minecraft/logs/latest.log`.
- CurseForge, Modrinth, and other launchers: open the affected instance/profile folder, then open `logs/latest.log`.
- The user may attach `latest.log` directly to Discord or upload the log to `https://mclo.gs/` and share the resulting link.
- Server problems may require both client and server `latest.log` files.

### Cooldown

Cooldown key: `(threadId, userId)`.

- Users without Manage Messages: one successful `info` response per 60 seconds in that thread.
- Users with Manage Messages: no cooldown.
- Cooldown violations are silently ignored to avoid extra clutter.
- Cooldown entries expire and are removed lazily.

The detailed help response is not part of warning cleanup and remains visible as ordinary requested guidance.

## Components

### `src/guidance/policy.js`

Pure functions that decide whether a detector result is complete and describe missing, rejected, or ambiguous information.

### `src/guidance/messages.js`

Pure builders for:

- Main warning payload
- Reminder payload
- Detailed `info` payload

Payloads use plain Discord-compatible objects and restrict allowed mentions.

### `src/guidance/thread-reader.js`

Discord adapter that fetches the starter, tags, and owner-authored messages and converts them into detector input.

### `src/guidance/coordinator.js`

Owns active-thread state, timer scheduling, re-checks, reminder replacement, and cleanup. Timer and Discord operations are injected for deterministic tests.

### `src/guidance/info-handler.js`

Recognises `info`, checks Manage Messages, enforces cooldowns, and sends the detailed response.

### `src/index.js`

Adds the required intent and routes `threadCreate` and `messageCreate` events without changing the existing slash-command flow.

## Error handling

- Starter fetch uses a bounded retry and then logs/skips the thread.
- Failure to send the main warning prevents reminder scheduling.
- Failure to delete an old reminder does not prevent sending the replacement, but is logged.
- Unknown-message deletion errors are ignored.
- Detection and message-building errors stop only the affected thread workflow.
- The Discord client remains online if one thread fails.

## TDD requirements

Tests are written before production changes and must cover:

- Complete/incomplete policy decisions.
- Each dynamic explanation case.
- No fixed response-format instruction and no RC requirement text.
- Log guidance is optional and limited to technical problem categories.
- Initial complete thread sends nothing.
- Initial incomplete thread replies to and pings only the owner.
- Owner-only evidence filtering.
- Immediate completion after an owner reply.
- 45-second scheduling.
- Maximum two reminders.
- Previous reminder deletion before replacement.
- Warning/reminder deletion on completion.
- Stop behaviour for deleted, archived, or locked threads.
- `info` recognition and reply behaviour.
- Per-user, per-thread 60-second cooldown.
- Manage Messages cooldown bypass.
- Other forums and bot messages ignored.
- Existing `/scan export` tests remain green.

## Non-goals

- No automatic locking or archiving.
- No deletion or editing of user messages.
- No mandatory log enforcement.
- No AI or semantic model calls.
- No persistent database or restart recovery in this version.
- No retroactive warning scan at startup.
