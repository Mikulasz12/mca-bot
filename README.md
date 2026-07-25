# MCA Bot

A private Discord bot for Minecraft Comes Alive support forums. It exports historical support threads, guides new thread owners toward usable version details, and checks public MCA release compatibility through a cached Modrinth catalogue.

## Features

- Owner-controlled `/scan export` command
- Immediate checks for new threads in the configured support forums
- Conversation-aware Minecraft, MCA Reborn, and loader detection
- Informal pair support such as `7.7.23+1.21.1`
- Later corrections supersede earlier version answers
- Public MCA/Minecraft/loader compatibility checks through Modrinth
- Branch- and loader-correct latest release recommendations
- Unknown development or unpublished builds are accepted rather than rejected
- Immediate acknowledgement when a partial answer meaningfully improves the thread
- Up to two replaceable reminder pings, 45 seconds apart
- Automatic warning/reminder cleanup once usable versions are provided
- Standalone `info` keyword for version and log help
- Administrator-only `/cache status` and `/cache update` commands
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

The bot deletes only messages it authored, so it does not need Manage Messages for warning cleanup. `/cache` is restricted to members whose effective guild permissions include Administrator; no role ID is hardcoded.

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

The bot registers `/scan export` globally, registers `/cache` immediately in guild `747184859386085380`, loads the local Modrinth cache, and begins listening for newly created forum threads. Existing threads are not warned when the bot starts.

## Live version guidance

When a new configured forum thread lacks usable Minecraft or MCA Reborn version information, the bot immediately replies to the starter and pings the thread owner.

It understands labelled values, separate replies, full JAR filenames, and informal pairs such as:

```text
7.7.23+1.21.1
mca-neoforge-7.7.23+1.21.1.jar
```

A later exact answer supersedes an older answer. For example, a final `7.7.23+26.1.2` correction replaces an earlier `7.7.23+1.21.1` pair. Ordinary replies such as `h` do not alter the detected state or reset reminder timing.

When a reply adds meaningful information, the bot updates its main warning immediately, replies to that message with what was accepted and what remains missing, and restarts the 45-second inactivity timer without resetting the number of scheduled reminders already sent.

The bot keeps at most one main guidance embed and one acknowledgement/reminder message. It sends at most two scheduled reminder pings and deletes the previous secondary message before replacing it.

Only the title, forum tags, starter post, and later messages or attachment filenames from the thread owner count as evidence. Staff examples and other bot messages cannot accidentally satisfy the check.

## Modrinth compatibility

The bot caches the MCA Reborn public version catalogue from Modrinth and checks that a known public MCA release supports the supplied Minecraft version and known loader.

- A verified public combination completes normally.
- A known public mismatch remains incomplete and receives a compatible recommendation for that exact Minecraft branch and loader.
- An MCA version absent from the public catalogue is treated as a possible development or unpublished build and is **not rejected**.
- When the loader is unknown and loader-specific latest releases differ, the bot asks whether the player uses Fabric, Forge, NeoForge, or Quilt instead of guessing.

The catalogue is stored locally at:

```text
data/modrinth-mca-versions.json
```

It is refreshed when missing or stale and then every six hours. Network or Modrinth failures preserve the previous cache. Discord replies never wait for a background refresh; without a usable cache, guidance falls back to syntax-only detection.

## Administrator cache commands

These guild-only commands require the effective Administrator permission:

```text
/cache status
/cache update
```

`/cache status` reports:

- Modrinth version records indexed
- Listed public records
- Unique MCA versions
- Supported Minecraft-version count
- Loader count and names
- Cache source, freshness, revision, and refresh state
- Last successful update and next scheduled refresh
- Rate-limit, disabled-refresh, or last-error diagnostics when applicable

`/cache update` requests a manual single-flight refresh. Concurrent refresh requests share the existing operation, and a failed update keeps the previous cache available.

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

Records retain raw version evidence for corpus analysis and also include resolved version information. Raw author IDs are not exported, attachments are not downloaded, and likely webhook/token strings are redacted.

## Development

```bash
npm test
npm run check
```

Tests do not connect to Discord or Modrinth. They use injected fake timers, fetch responses, cache stores, Discord adapters, and interactions to cover exports, conversation resolution, catalogue compatibility, cache failure handling, dynamic guidance, reminder races, `info` cooldowns, Administrator cache authorization, and event routing.

## Current limitations

- Reminder state is process-local and is lost when the bot restarts.
- No retroactive live-warning scan runs on startup.
- The Modrinth cache covers public MCA Reborn releases only; development and private builds rely on syntax/JAR evidence.
- No persistent Discord workflow database or semantic/AI matching is used.
