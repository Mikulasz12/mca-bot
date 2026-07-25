# MCA Discord Thread Scan Export Design

## Purpose

Build a small local Discord bot that exports existing support and bug-report forum threads so their real Minecraft and MCA version-writing patterns can be reviewed and converted into deterministic regex rules later.

The first release performs observation only. It does not warn users, edit threads, change tags, lock threads, archive threads, or call an external AI service.

## Fixed scope

The bot exposes exactly one application command:

```text
/scan export
```

The command scans exactly these Discord forum channels:

- `1082779790714613840`
- `1131690144160825455`

The bot accepts commands only from owner user ID `245983842672967680`. The command may be invoked in a direct message with the bot or inside guild `747184859386085380`. Calls from other users or guilds are rejected at runtime.

## Runtime and dependencies

- Node.js 22 or newer
- ECMAScript modules
- discord.js 14.16.3
- Node's built-in test runner
- Local filesystem storage
- No database
- No Docker or server deployment in this release

## Command registration and access control

The command is registered globally so it can be used in bot DMs. Its declared contexts are guild and bot DM. Its integration type is guild install.

Discord command permissions are treated as presentation defaults, not the security boundary. Every interaction is checked at runtime:

1. The interaction must be `/scan export`.
2. `interaction.user.id` must equal `245983842672967680`, unless a future role ID is explicitly added to `SCAN_EXPORT_ROLE_IDS`.
3. A DM invocation is allowed only for the owner.
4. A guild invocation must originate from guild `747184859386085380`.
5. A guild role override is considered only inside the allowed guild.

`SCAN_EXPORT_ROLE_IDS` is empty by default. It provides a narrow future extension point for selected moderator or administrator roles without changing the command handler.

## Historical scan flow

When `/scan export` is invoked:

1. Defer the interaction response.
2. Resolve each configured forum channel and verify it belongs to the allowed guild.
3. Fetch active threads.
4. Page through all archived public threads using `fetchArchived`, following `hasMore` and the oldest archived thread as the next `before` cursor.
5. Deduplicate threads by ID.
6. Process threads sequentially to keep memory and API pressure low.
7. Fetch the thread starter message.
8. Fetch a small window around the starter and retain the first five chronological non-starter messages.
9. Convert tags, messages, and attachment metadata into a stable JSON record.
10. Append one JSON object per line to a timestamped `.jsonl` file.
11. Report the local path, exported thread count, skipped thread count, and error count.
12. Attempt to attach the file to the response. If Discord rejects the attachment, retain the disk export and report its path.

A failure in one thread is recorded in that thread's export record and does not abort the full scan. A failure resolving a configured forum channel is fatal because it indicates invalid configuration or missing permissions.

## Export format

The output path is:

```text
exports/mca-thread-scan-YYYY-MM-DDTHH-mm-ss-sssZ.jsonl
```

Every line is an independent JSON object with `schemaVersion: 1` and contains:

- Export timestamp
- Guild ID
- Forum channel ID and name
- Thread ID, URL, title, timestamps, archived state, and locked state
- Applied forum tag IDs and names
- Starter message plus the first five replies
- For each message: position, author kind, text content, and attachment metadata
- Per-thread non-fatal errors

Raw user IDs are not exported. Authors are classified as `thread-owner`, `bot`, or `other`. Attachment bytes are never downloaded; only filename, content type, and size are recorded.

Likely Discord bot tokens and webhook URLs are redacted from message content before writing. Version strings and attachment filenames are left intact for later matcher work.

## Message selection

The starter message is always first. Remaining fetched messages are sorted by Discord snowflake timestamp, the starter is removed, and the earliest five replies are retained. The selection logic is Discord-independent and covered by unit tests.

## File safety

The export directory is created automatically. Data is written to a temporary file and renamed atomically after a successful scan. Failed scans remove the temporary file where possible.

The `exports/` directory and `.env` are ignored by Git. The bot token is read only from `DISCORD_TOKEN` and is never logged.

## User experience

The bot sends a concise progress acknowledgement, then finishes with a summary. Only one scan may run at a time in a process. A second invocation receives an ephemeral or private response explaining that a scan is already running.

The command never posts into scanned threads.

## Testing strategy

Development follows red-green-refactor TDD using `node --test`.

Unit tests cover:

- Configuration parsing and validation
- Owner-only DM access
- Allowed-guild access
- Wrong-user and wrong-guild rejection
- Future role override behavior
- Active and archived thread pagination
- Thread deduplication
- Pagination termination when Discord repeats a cursor
- Chronological selection of the first five replies
- Author classification without exporting user IDs
- Sensitive-text redaction
- Stable JSONL serialization
- Atomic export creation and cleanup

Discord gateway code remains thin. Discord-independent logic receives plain objects and injected functions so it can be tested without connecting to Discord.

## Permissions and setup requirements

The Discord application must have access to the allowed guild and both forum channels. It needs permission to view the channels and read message history. The Message Content privileged intent must be enabled in the Discord Developer Portal and in the client configuration so existing message text is available.

## Explicitly deferred work

The following are not part of this release:

- Regex-based Minecraft or MCA version detection
- Semantic matching
- Live `threadCreate` monitoring
- User warnings
- Moderator-facing commands
- SQLite persistence or resume support
- Ubuntu/systemd deployment
- Docker
- External APIs

Those features will be designed only after the exported corpus has been reviewed.
