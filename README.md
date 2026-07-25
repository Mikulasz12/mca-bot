# MCA Bot

A small private Discord bot for exporting existing Minecraft Comes Alive support threads for later pattern and regex analysis.

The first release has exactly one command:

```text
/scan export
```

It scans these forum channels only:

- `1082779790714613840`
- `1131690144160825455`

It reads each thread's starter post and first five replies, then writes one timestamped JSONL file under `exports/`. It does not warn users, edit threads, change tags, download attachments, or call an AI service.

## Requirements

- Node.js 22 or newer
- A Discord application and bot token
- Access to guild `747184859386085380`
- Access to both configured forum channels

## Discord Developer Portal setup

1. Create or open the Discord application that will run this bot.
2. Open **Bot** and enable the **Message Content Intent**.
3. Reset or copy the bot token and keep it private.
4. Under **OAuth2 → URL Generator**, select:
   - `bot`
   - `applications.commands`
5. Grant the bot these permissions:
   - View Channels
   - Read Message History
   - Send Messages
   - Attach Files
6. Install the bot into guild `747184859386085380`.

The bot registers `/scan export` globally on startup so the command can be used in a bot DM as well as the configured guild. The runtime authorization check is the security boundary: only user `245983842672967680` is allowed by default.

## Install

```bash
npm install
```

Create `.env` from `.env.example`.

### Linux or macOS

```bash
cp .env.example .env
```

### PowerShell

```powershell
Copy-Item .env.example .env
```

Set `DISCORD_TOKEN` in `.env`:

```dotenv
DISCORD_TOKEN=your_bot_token_here
OWNER_USER_ID=245983842672967680
ALLOWED_GUILD_ID=747184859386085380
FORUM_CHANNEL_IDS=1082779790714613840,1131690144160825455
SCAN_EXPORT_ROLE_IDS=
EXPORT_DIR=./exports
```

`SCAN_EXPORT_ROLE_IDS` is deliberately empty. Later, selected moderator or administrator role IDs may be added as a comma-separated list to grant this specific command inside the configured guild. DMs always remain owner-only.

## Run

```bash
npm start
```

Keep the terminal open while the bot runs. When it reports that `/scan export` is registered, open a DM with the bot or use the command inside the configured guild:

```text
/scan export
```

Only one export can run at a time. The bot processes threads sequentially and reports the final local path.

The file name looks like:

```text
exports/mca-thread-scan-2026-07-25T20-32-07.123Z.jsonl
```

Upload that JSONL file into the ChatGPT conversation for review. The later phase will use the real examples to create regex rules and TDD regression fixtures.

## Export contents

Each line contains one thread record with:

- Thread title, ID, URL, timestamps, tags, and state
- Starter post plus the first five replies
- Attachment filenames, content types, and sizes
- Anonymized author kinds: `thread-owner`, `bot`, or `other`
- Per-thread read errors

Attachment files are not downloaded. Raw author user IDs are not exported. Likely Discord webhook URLs and bot tokens are redacted before the file is written.

The export contains Discord message text, so keep it private and review it before sharing outside the project team.

## Development

Run the test suite:

```bash
npm test
```

Run syntax checks:

```bash
npm run check
```

The unit tests do not connect to Discord. They cover configuration, authorization, pagination, deduplication, reply selection, redaction, record creation, atomic file output, command locking, error handling, and attachment fallback.

## Current limitations

This release intentionally does not include:

- Minecraft or MCA version regex detection
- Semantic matching
- Live thread monitoring
- Automatic user warnings
- Additional Discord commands
- Server deployment

Those will be considered after the historical JSONL corpus has been reviewed.
