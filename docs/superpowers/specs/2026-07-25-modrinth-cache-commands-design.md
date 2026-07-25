# Modrinth Cache Commands Design

## Goal

Add administrator-only Discord commands for inspecting and manually refreshing the MCA Reborn Modrinth catalogue introduced by the Modrinth-aware guidance design.

## Command surface

Add one chat-input command with two subcommands:

- `/cache status`
- `/cache update`

The command is available only in guild context. It is registered as a guild command in `747184859386085380` so updates appear immediately without waiting for global command propagation.

## Authorization

Discord command metadata sets `default_member_permissions` to Administrator so the command is hidden from ordinary members by default. Runtime authorization remains the security boundary:

- `interaction.guildId` must equal `747184859386085380`.
- `interaction.memberPermissions` must contain Administrator.
- DMs and other guilds are rejected with an ephemeral response.

Any role that grants the effective Administrator permission qualifies; no role ID is hardcoded and the bot does not create or modify Discord roles.

## `/cache status`

Return an ephemeral status message containing:

- Indexed Modrinth version-record count.
- Unique normalised MCA version count.
- Distinct supported Minecraft-version count.
- Distinct loader count and loader names.
- Cache availability and source: disk, network, or unavailable.
- Timestamp of the last successful refresh.
- Cache age and whether it is stale using the six-hour freshness policy.
- Whether a refresh is currently running.
- The next scheduled automatic refresh time when known.
- Any active Modrinth rate-limit delay or automatic-refresh disable reason.

The user wording "mods indexed" is represented accurately as "Modrinth version records indexed" because this cache indexes releases of one mod, MCA Reborn.

## `/cache update`

Defer an ephemeral response, invoke the catalogue service's single-flight manual refresh, and then show the same status fields plus whether the refresh changed the catalogue revision.

- A concurrent automatic or manual refresh is joined rather than duplicated.
- A successful refresh atomically replaces memory and disk cache.
- A failed refresh preserves the previous cache and reports the error without taking guidance offline.
- A manual update honours an active Modrinth 429 reset time and a 410-disabled state; it must not create a retry loop.

## Registration and routing

- Keep `/scan export` registration unchanged.
- Register `/cache` as a guild-scoped command for the configured guild during `ClientReady`.
- Route cache interactions before the existing scan handler.
- Cache command failures remain isolated and use ephemeral responses.

## Components

### `src/discord/cache-command.js`

Build the Administrator-only, guild-context `/cache` command and its `status` and `update` subcommands.

### `src/discord/cache-handler.js`

Authorize interactions, format cache status, defer manual updates, and invoke the catalogue service.

### `src/modrinth/service.js`

Expose stable `status()` and `refresh()` interfaces suitable for the command handler without exposing mutable catalogue internals.

### `src/index.js`

Register the guild command and compose cache and scan interaction handlers.

## TDD requirements

Tests must cover:

- Command metadata contains both subcommands, guild-only context, and Administrator default permission.
- Runtime denial in DMs, other guilds, and without Administrator.
- Administrator role access in the configured guild.
- Status output when unavailable, loaded from disk, refreshed from network, stale, and refreshing.
- Status counts version records, unique MCA versions, Minecraft versions, and loaders accurately.
- Manual update joins an in-progress refresh.
- Manual update success and failure while preserving stale cache.
- Existing `/scan export` behaviour and command tests remain green.

## Non-goals

- No automatic role creation or role-ID configuration.
- No command for deleting the cache.
- No command for changing refresh cadence or Modrinth project ID.
- No public/non-admin cache statistics.
