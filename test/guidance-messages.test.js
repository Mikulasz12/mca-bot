import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInfoReply, buildMainWarning, buildReminder } from '../src/guidance/messages.js';

const diagnosis = {
  complete: false,
  missing: ['MCA Reborn version'],
  detected: ['Minecraft: `1.21.1`'],
  reasons: ['The MCA Reborn version is missing.'],
};

test('main warning pings only the owner and contains dynamic guidance', () => {
  const payload = buildMainWarning({ ownerId: '123', diagnosis, starterId: '456' });
  assert.equal(payload.content, '<@123>');
  assert.deepEqual(payload.allowedMentions, { users: ['123'], roles: [], parse: [], repliedUser: false });
  assert.deepEqual(payload.reply, { messageReference: '456', failIfNotExists: false });
  const text = JSON.stringify(payload);
  assert.match(text, /MCA Reborn version/);
  assert.match(text, /Minecraft: `1\.21\.1`/);
  assert.match(text, /type `info`/i);
  assert.match(text, /latest\.log/i);
  assert.match(text, /mclo\.gs/i);
  assert.doesNotMatch(text, /reply using this format/i);
  assert.doesNotMatch(text, /RC/i);
});

test('reminder is short, dynamic, and owner-only', () => {
  const payload = buildReminder({ ownerId: '123', diagnosis, starterId: '456', reminderNumber: 1 });
  assert.equal(payload.content.startsWith('<@123>'), true);
  assert.match(payload.content, /MCA Reborn version/);
  assert.deepEqual(payload.allowedMentions.users, ['123']);
});

test('info reply explains versions, logs, launchers, and optionality', () => {
  const payload = buildInfoReply({ messageId: '789' });
  const text = JSON.stringify(payload);
  assert.match(text, /mca-neoforge-7\.7\.23\+1\.21\.1\.jar/);
  assert.match(text, /%appdata%/i);
  assert.match(text, /~\/\.minecraft\/logs\/latest\.log/);
  assert.match(text, /Application Support\/minecraft\/logs\/latest\.log/);
  assert.match(text, /CurseForge/i);
  assert.match(text, /Modrinth/i);
  assert.match(text, /mclo\.gs/i);
  assert.match(text, /not required for every/i);
  assert.deepEqual(payload.reply, { messageReference: '789', failIfNotExists: false });
});
