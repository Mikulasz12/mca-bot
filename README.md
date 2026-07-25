# MCA Bot

A private Discord bot for Minecraft Comes Alive support forums. It can export historical support threads and guide new thread owners when exact Minecraft or MCA Reborn versions are missing.

## Features

- Owner-controlled `/scan export` command
- Immediate checks for new threads in the configured support forums
- Dynamic version guidance based on what was detected
- Up to two replaceable reminder pings, 45 seconds apart
- Automatic warning/reminder cleanup once both exact versions are provided
- Standalone `info` keyword for version and log help
- No AI services, automatic locking, archiving, or deletion of user messages

The configured forums are:

- `1082779790714613840`
- `1131690144160825455`

## Requirements

- Node.js 22 or newer
- A Discord application and bot token
- Access to guild `747184859386085380`
- Access to both configured forum channels

## Discord Developer Portal setup

1. Create or open the Discord application that will run this bot.
2. Open **Bot** and enable the **Message Content Intent**.
3. Reset or copy the bot token and keep it private.
4. Under **OAuth2 → URL Generator**, select `bot` and `applications.commands`.
5. Grant the bot:
   - View Channels
   - Read Message History
   - Send Messages
   - Send Messages in Threads
   - Embed Links
   - Attach Files
6. Install the bot into guild `747184859386085380`.

The bot deletes only messages it authored, so it does not need Manage Messages for its own warning cleanup.

## Install

```bash
npm install
```

Copy `.env.example` to `.env` and set the token:

```dotenv
DISCORD_TOKEN=your_bot_token_here
OWNER_USER_ID=245983842672967680
ALLOWED_GUILD_ID=747184859386085380
FORUM_CHANNEL_IDS=1082779790714613840,1131690144160825455
SCAN_EXPORT_ROLE_IDS=
EXPORT_DIR=./exports
```

## Run

```bash
npm start
```

The bot registers `/scan export` globally and begins listening for newly created forum threads. Existing threads are not warned when the bot starts.

## Live version guidance

When a new configured forum thread does not contain exactly one Minecraft version and exactly one MCA Reborn version, the bot immediately replies to the starter and pings the thread owner.

The warning explains what is missing or ambiguous, shows any valid version already detected, and suggests checking the launcher mod list, instance `mods` folder, or MCA JAR name. For example:

```text
mca-neoforge-7.7.23+1.21.1.jar
```

Here `7.7.23` is MCA Reborn and `1.21.1` is Minecraft.

The bot checks again after 45 seconds. It sends at most two reminder pings and deletes the previous reminder before sending its replacement. Once an owner reply supplies both exact versions, the bot deletes its main warning and current reminder.

Only the title, forum tags, starter post, and later messages from the thread owner count as version evidence. Staff examples and other bot messages cannot accidentally satisfy the check.

## `info` help

Typing `info` by itself in a configured support thread returns detailed help. Users without Manage Messages may receive this response once per minute per thread. Members with Manage Messages bypass the cooldown.

For crashes, bugs, loading failures, or other technical problems, the help recommends `latest.log`. Logs are not mandatory for every support question.

Common locations:

- Windows: `%appdata%\.minecraft\logs\latest.log`
- Linux: `~/.minecraft/logs/latest.log`
- macOS: `~/Library/Application Support/minecraft/logs/latest.log`
- CurseForge, Modrinth, and other launchers: open the affected profile/instance folder, then `logs/latest.log`

Users can attach `latest.log` directly in Discord or upload its contents to `https://mclo.gs/` and share the resulting link. Server problems may need both client and server logs.

## Historical export

Run:

```text
/scan export
```

The command scans configured forums, reads each starter plus the first five replies, and writes a timestamped JSONL file under `exports/`. Only one export runs at a time.

Records include thread metadata, tags, selected messages, attachment metadata, redacted sensitive strings, and detected Minecraft/MCA version information. Raw author IDs are not exported.

## Development

```bash
npm test
npm run check
```

Tests do not connect to Discord. They cover authorization, pagination, exports, version detection, dynamic guidance, owner-only evidence, reminder timing and replacement, cleanup, `info` cooldowns, and event routing.

## Current limitations

- Reminder state is process-local and is lost when the bot restarts.
- No retroactive live-warning scan runs on startup.
- No persistent database or semantic/AI matching is used.
