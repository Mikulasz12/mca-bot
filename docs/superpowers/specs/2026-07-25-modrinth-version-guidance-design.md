# Modrinth-Aware Version Guidance Design

## Goal

Improve live support guidance so informal version answers are understood, later corrections supersede earlier answers, public MCA releases are checked against the supplied Minecraft version and loader, and players who repeatedly provide unusable information receive progressively more practical help.

The feature must never reject a plausible development, private, GitHub, or otherwise unpublished MCA build merely because it is absent from Modrinth.

## Scope

This design extends the existing live guidance system and version detector. It does not change `/scan export`, require Modrinth authentication, download mod files, automatically modify user installations, or make Modrinth availability a prerequisite for Discord support.

## Modrinth source of truth

Use the public Modrinth v2 endpoint:

`GET https://api.modrinth.com/v2/project/1W98a849/version?include_changelog=false`

`1W98a849` is the stable project ID for MCA Reborn. The project slug may be used only as a documented fallback.

The catalogue retains only fields required by this bot:

- `id`
- `version_number`
- `game_versions`
- `loaders`
- `version_type`
- `status`
- `date_published`
- primary file `filename`

The endpoint supports project IDs or slugs and returns the version number, supported Minecraft versions, loaders, release type, publication status, publication date, and files. Changelogs are explicitly disabled because the bot does not use them.

Every request sends a unique user agent:

`Mikulasz12/mca-bot/0.1.0 (https://github.com/Mikulasz12/mca-bot)`

No access token is required for this public read endpoint.

## Catalogue cache

### Storage

Cache path:

`data/modrinth-mca-versions.json`

Add `data/` to `.gitignore`. The cache is local runtime data and must never be committed.

The persisted document contains:

```json
{
  "schemaVersion": 1,
  "projectId": "1W98a849",
  "fetchedAt": "2026-07-25T22:00:00.000Z",
  "versions": []
}
```

Writes use a temporary file plus atomic rename.

### Loading and refresh

- Load a valid disk cache at startup before enabling catalogue validation.
- A cache is fresh for six hours.
- Refresh immediately in the background when the cache is missing or stale.
- Schedule another refresh every six hours while the bot remains online.
- Use a ten-second request timeout.
- Only one refresh may run at a time.
- A successful refresh replaces the in-memory and disk catalogue atomically.
- A failed refresh preserves the previous in-memory and disk cache.
- When no cache exists and the network request fails, continue in syntax-only mode.
- A `429` response honours `X-Ratelimit-Reset` before the next scheduled attempt; it must not create a retry loop.
- A `410` response logs that the API version needs updating and disables automatic refresh until restart.

The bot must never hold up a Discord reply while waiting for Modrinth.

## Parsing improvements

### Informal complete pairs

Recognise a complete MCA/Minecraft pair when the version shapes make the order unambiguous, including:

- `7.7.23+1.21.1`
- `7.7.23 + 26.1.2`
- `7.7.23 / 1.21.1`
- `MCA 7.7.23, Minecraft 1.21.1`
- `mca-neoforge-7.7.23+1.21.1.jar`

For unlabelled pairs, the first value must have an MCA-shaped major and the second must have a Minecraft-shaped major. Do not infer arbitrary two-version strings whose shapes do not establish the roles.

The parser records pair evidence explicitly:

```js
{
  mca: '7.7.23',
  minecraft: '26.1.2',
  loader: null,
  source: 'reply-3',
  explicit: true
}
```

### Loader detection

Detect these canonical loaders:

- `fabric`
- `forge`
- `neoforge`
- `quilt`

Evidence sources:

- Applied forum tags
- Explicit owner text
- MCA JAR filename prefixes

Normalise spelling and case, including `NeoForge`, `neo forge`, and `neoforge`.

Several different detected loaders are ambiguous. A loader is helpful for recommendations but is not required to complete the existing Minecraft/MCA information requirement.

## Conversation-aware resolution

The detector separates extraction from resolution.

### Precedence

1. Latest relevant owner reply
2. Earlier owner replies
3. Starter post
4. Thread title
5. Applied tags

### Per-field latest-wins rules

- The most recent owner reply that supplies an exact Minecraft version supersedes older Minecraft values.
- The most recent owner reply that supplies an exact MCA version supersedes older MCA values.
- A complete explicit pair in one owner reply supersedes all earlier Minecraft and MCA values together.
- Two different pairs in the same latest message remain ambiguous.
- Two different values for the same field in the same latest message remain ambiguous.
- Separate messages remain valid: an owner may send Minecraft first and MCA later.
- Unrelated messages such as `h`, `hello`, or ordinary prose do not alter resolved versions.

For this sequence:

```text
26.1.2
7.7.23+1.21.1
7.7.23+26.1.2
```

resolve the final state as MCA `7.7.23` with Minecraft `26.1.2` because the final complete explicit pair is authoritative.

The raw detector evidence remains available for JSONL analysis, but live guidance consumes the resolved state.

## Catalogue normalisation

Modrinth version numbers commonly include the Minecraft suffix, such as `7.7.10+1.21.1`. Normalise each catalogue entry into:

```js
{
  id: 'jUR1gnO0',
  mcaVersion: '7.7.10',
  versionNumber: '7.7.10+1.21.1',
  minecraftVersions: ['1.21.1'],
  loaders: ['neoforge'],
  versionType: 'release',
  status: 'listed',
  publishedAt: '...',
  filename: '...jar'
}
```

Strip only a trailing Minecraft build suffix that agrees with a value in `game_versions`. Preserve MCA prerelease information such as `-alpha.3` or `-beta.2`.

Only `listed` public versions are used for compatibility and latest-release recommendations. Archived, draft, unlisted, scheduled, and unknown statuses are retained only for diagnostics if returned, not recommended.

## Compatibility result

Given a resolved exact MCA version, Minecraft version, and optional loader, return one of:

### `verified`

At least one listed Modrinth entry has the same normalised MCA version, contains the supplied Minecraft version, and, when loader is known, contains that loader.

The thread is complete and guidance is cleaned up.

### `known-incompatible`

The MCA version exists publicly, but no listed entry supports the supplied Minecraft version, or no entry supports the known loader for that Minecraft version.

The thread remains incomplete for guidance purposes. Explain the mismatch and recommend a compatible latest public release.

### `unknown-build`

No listed Modrinth entry has that normalised MCA version, or the catalogue is unable to verify the exact pair.

Do not reject it. Treat the exact pair as complete because it may be a development or unpublished build. Optionally mention that the pair could not be verified publicly and ask for the complete JAR filename when the support problem is technical.

### `catalogue-unavailable`

No usable cache is loaded.

Use syntax-only completion and do not claim compatibility or incompatibility.

## Latest compatible recommendation

Recommendations are calculated at response time from the cached catalogue; no version number is hardcoded.

### Selection

1. Filter to `listed` entries supporting the supplied Minecraft version.
2. When a loader is known, also require that loader.
3. Prefer `release` entries.
4. If no release exists, prefer `beta`, then `alpha`.
5. Within the selected release channel, choose the latest `date_published`.

The recommendation includes:

- MCA version number
- Minecraft version
- Loader or loaders
- Direct Modrinth version page: `https://modrinth.com/mod/minecraft-comes-alive-reborn/version/{versionId}`

### Unknown loader

When loader is not known:

- If the same latest MCA version is available for every applicable loader, recommend it directly.
- If latest version numbers differ by loader, do not guess. Ask which loader they use and link the general Modrinth versions page.

A player on Minecraft `1.21.1` must never be recommended a `26.1.2` or `26.2` build. A player on one loader must never be directed to a file that only supports another known loader.

## Guidance after owner replies

Track a diagnosis fingerprint containing resolved Minecraft, MCA, loader, compatibility state, missing fields, and ambiguity reasons.

### Meaningful progress

When an owner reply changes the fingerprint:

- Cancel and replace the current 45-second timer.
- Preserve the count of scheduled reminders already sent.
- Delete the previous response/reminder message.
- Edit or replace the main warning so it reflects only the current state.
- Reply directly to the owner’s latest message and ping only the owner.

Examples:

- `Minecraft 26.1.2` detected, MCA still missing.
- MCA detected, Minecraft still missing.
- A corrected complete pair replaces an older pair.
- A public MCA version is incompatible with the supplied Minecraft version.

An acknowledgement caused by progress does not count as reminder 1 or 2.

### No progress

When an owner reply does not change the fingerprint:

- Do not ping.
- Do not reset the timer.
- Do not increment invalid-attempt help.
- Leave the existing guidance unchanged.

This includes ordinary messages such as `h` and exact repeats of the same unusable answer.

## Repeated invalid-information help

Count distinct version-related owner attempts that change the evidence but still leave the thread incomplete. Do not count ordinary conversation, repeated identical answers, or unknown builds accepted as complete.

### Attempt 1

Give a precise dynamic correction:

- Which value was accepted
- Which value is still missing
- Whether a supplied value looks like the wrong category
- Whether multiple current values are ambiguous

### Attempt 2

Add direct practical help:

- Show how to identify the MCA and Minecraft portions of a JAR filename
- Recommend the latest compatible public Modrinth release when Minecraft and loader are known
- If loader is unknown and recommendations differ, ask for Fabric, Forge, NeoForge, or Quilt

### Attempt 3 and later

Do not shame or repeatedly spam the player. Provide one escalated assistance response per new diagnosis:

- Ask them to attach or paste the complete MCA JAR filename from the instance `mods` folder
- Suggest attaching a screenshot of the launcher’s installed-mod entry when they cannot find the filename
- For crashes, bugs, loading failures, or technical problems, remind them to attach `latest.log` or share an `mclo.gs` link
- Link the MCA Reborn Modrinth versions page

Continue listening silently after the two scheduled reminders. A later meaningful correction still gets an acknowledgement and can complete the workflow.

## Message lifecycle

Maintain at most:

- One main guidance embed
- One acknowledgement or scheduled reminder message

When the diagnosis changes:

- Prefer editing the main warning in place.
- Replace the acknowledgement/reminder message so only one secondary bot message remains.

When the thread becomes complete:

- Cancel timers.
- Delete the main warning.
- Delete the current acknowledgement/reminder.
- Stop tracking.

For `unknown-build`, completion cleanup still occurs. The bot must not leave a blocking warning solely because Modrinth could not verify the build.

## Concurrency and races

Per-thread state adds:

```text
lastDiagnosisFingerprint
invalidAttemptCount
timerGeneration
catalogueRevision
```

- Increment `timerGeneration` whenever a timer is replaced or cancelled.
- A timer callback exits when its captured generation is stale.
- Serialize checks per thread.
- When the catalogue refreshes, do not automatically ping every tracked thread. Apply the new revision at the next owner message or scheduled check.
- A reminder callback that races with a completing owner reply must re-read the thread before sending.

## Components

### `src/version/extract.js`

Pure extraction of labelled values, bare values, informal pairs, filenames, and loader candidates per source.

### `src/version/resolve.js`

Conversation-aware latest-wins resolution and explicit-pair authority.

### `src/version/detect.js`

Compatibility wrapper retaining the existing public function while returning raw evidence, resolved values, loader state, and explicit pairs.

### `src/modrinth/catalogue.js`

Normalise Modrinth records and answer compatibility/latest queries.

### `src/modrinth/cache.js`

Disk loading, atomic writes, freshness, and schema validation.

### `src/modrinth/client.js`

Public API fetch with timeout, unique user agent, response validation, and rate-limit handling.

### `src/modrinth/service.js`

Own in-memory catalogue, startup loading, single-flight refresh, six-hour scheduling, and graceful fallback.

### `src/guidance/policy.js`

Combine resolved detector output with catalogue compatibility into the guidance diagnosis and fingerprint.

### `src/guidance/messages.js`

Render partial-answer acknowledgements, compatibility mismatch help, latest compatible recommendations, unknown-build wording, and escalating assistance.

### `src/guidance/coordinator.js`

Update messages on meaningful progress, preserve reminder count, reset inactivity timers, and prevent stale-timer races.

### `src/index.js`

Start the catalogue service, inject it into guidance, and stop its interval during process shutdown.

## Error handling

- Invalid cache JSON is ignored and logged once.
- Unexpected Modrinth response shapes do not replace a valid cache.
- Network, timeout, 5xx, and parse failures preserve cached data.
- Compatibility claims are never made from an empty or invalid catalogue.
- Unknown builds are never converted into known incompatibility.
- Message-edit failure falls back to delete-and-send when possible.
- A failed acknowledgement must not reset the scheduled reminder count.
- All failures remain isolated to the affected catalogue refresh or Discord thread.

## TDD requirements

Tests must be written before production changes and cover:

- Informal `MCA+Minecraft` pairs.
- Labelled pairs and full JAR filenames.
- Latest owner value wins independently per field.
- Latest complete pair supersedes earlier answers.
- Multiple pairs in one latest message remain ambiguous.
- Unrelated owner messages do not change resolved state.
- Loader extraction and ambiguity.
- Modrinth normalisation including suffix stripping and prereleases.
- Verified Minecraft and loader alignment.
- Known MCA version with wrong Minecraft version.
- Known MCA/Minecraft pair with wrong known loader.
- Unknown build accepted without blocking.
- Catalogue-unavailable syntax-only fallback.
- Latest stable selection by Minecraft and loader.
- Beta/alpha fallback only when no release exists.
- Unknown-loader recommendation does not guess when loaders differ.
- Valid cache loading and invalid-cache rejection.
- Atomic cache publication.
- Fresh/stale cache decisions.
- Single-flight refresh and six-hour schedule.
- Timeout, 429, 410, 5xx, malformed JSON, and stale-cache preservation.
- Unique Modrinth user agent and `include_changelog=false`.
- Partial-answer acknowledgement and main-message update.
- Timer reset on meaningful progress while preserving reminder count.
- No reset or ping for `h`, repeats, and no-progress replies.
- Stale timer generation cannot send.
- Escalating help for distinct invalid attempts.
- Unknown build completes and cleans up.
- Existing detector, export, guidance, and command tests remain green.

## Non-goals

- No CurseForge catalogue integration in this increment.
- No automatic mod download or installation.
- No requirement for users to run the newest version before receiving support.
- No rejection of development or unpublished builds.
- No persistent Discord workflow state across bot restarts.
- No AI or semantic model calls.
