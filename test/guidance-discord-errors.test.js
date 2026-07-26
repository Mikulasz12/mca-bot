import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMissingDiscordResource,
  isUnknownChannel,
  isUnknownMessage,
} from '../src/guidance/discord-errors.js';

test('recognises direct and nested Discord missing-resource codes', () => {
  assert.equal(isUnknownMessage({ code: 10008 }), true);
  assert.equal(isUnknownMessage({ rawError: { code: '10008' } }), true);
  assert.equal(isUnknownChannel({ cause: { code: 10003 } }), true);
  assert.equal(isMissingDiscordResource({ data: { code: '10003' } }), true);
});

test('recognises Discord missing-resource messages when a code is unavailable', () => {
  assert.equal(isMissingDiscordResource(new Error('Unknown Message')), true);
  assert.equal(isMissingDiscordResource(new Error('Unknown Channel')), true);
  assert.equal(isMissingDiscordResource(new Error('Missing Access')), false);
});
