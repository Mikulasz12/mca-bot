# Guidance Priority, Deleted Threads, and Cleanup Design

## Goal

Make live forum guidance resilient when threads disappear, exclude non-MCA support categories, and make configured forum version tags authoritative while completing a focused whole-repository cleanup pass.

## Behaviour

### Excluded forum tags

A configured support-forum thread is ignored when any applied tag name, compared case-insensitively after trimming, is one of:

- `Server Help`
- `Non-MCA Help`
- `Translation Help`

The exclusion check happens before fetching the starter message or message history. Threads with an excluded tag never receive guidance, reminders, or `info` responses from the version-guidance workflow.

### Forum-tag priority

A tag named `MCA <version>` is the authoritative Minecraft-version source. When present:

- its Minecraft version overrides conflicting title, starter, reply, and attachment evidence;
- later owner messages may still supply or correct MCA Reborn and loader information;
- changing/removing the forum tag triggers a fresh resolution against the new tag state;
- multiple conflicting `MCA <version>` tags remain ambiguous rather than selecting one arbitrarily.

A bare version-only title continues to act as MCA Reborn evidence when it has an MCA-shaped version number. It cannot override the Minecraft version supplied by a forum tag.

### Deleted Discord resources

Discord API errors representing a missing message or channel (`Unknown Message` / code `10008`, `Unknown Channel` / code `10003`) are expected disappearance signals rather than operational failures. Starter-message `Unknown Message` responses retain the existing short retry window because Discord can briefly expose a new thread before its starter is readable. If the retries still fail, tracking stops silently.

Context determines the follow-up:

- a missing starter or channel cancels timers and removes process-local tracking without cleanup I/O;
- an `Unknown Message` while editing or deleting one bot-authored guidance message is treated as that message having already been removed, so the bot may recreate the main warning when the thread still exists;
- expected missing-resource races do not emit error-level logs;
- authentication, permission, network, and unexpected API failures remain logged.

### Cleanup scope

Review the fixed repository through reuse, code quality, correctness, and efficiency lenses. Apply only local, high-confidence improvements that directly reduce duplication, race risk, misleading logging, repeated parsing, or weak tests. No dependency upgrades or unrelated architectural rewrites.

## Testing

Regression coverage must include:

- excluded tags skip before starter fetch;
- exclusion is case-insensitive and wins even with an MCA version tag;
- forum Minecraft tag overrides conflicting title and owner reply values;
- conflicting forum Minecraft tags remain ambiguous;
- deleted starter/message/channel stops tracking silently;
- unexpected read/delete failures still log;
- runtime test fixtures include every registered Discord event;
- full `npm test` and `npm run check` pass.
