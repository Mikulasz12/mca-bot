import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInfoReply, buildMainWarning, buildProgressAcknowledgement, buildReminder } from '../src/guidance/messages.js';

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
  assert.match(text, /\/info/i);
  assert.doesNotMatch(text, /type `info`/i);
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

test('progress acknowledgement thanks the owner and asks only for what remains', () => {
  const payload = buildProgressAcknowledgement({ ownerId: '123', messageId: '999', diagnosis, invalidAttemptCount: 1 });
  assert.equal(payload.content.startsWith('<@123>'), true);
  assert.match(payload.content, /detected Minecraft/i);
  assert.match(payload.content, /still need.*MCA Reborn/i);
  assert.deepEqual(payload.reply, { messageReference: '999', failIfNotExists: false });
});

test('known incompatibility acknowledgement recommends the exact compatible Modrinth version', () => {
  const incompatible = {
    ...diagnosis,
    compatibility: 'known-incompatible',
    minecraftVersion: '26.1.2',
    mcaVersion: '7.7.22',
    reasons: ['MCA Reborn `7.7.22` does not match Minecraft `26.1.2`.'],
    recommendation: {
      status: 'direct',
      entry: { mcaVersion: '7.9.6', url: 'https://modrinth.com/mod/minecraft-comes-alive-reborn/version/good' },
      loaders: ['fabric'],
    },
  };
  const payload = buildProgressAcknowledgement({ ownerId: '123', messageId: '999', diagnosis: incompatible, invalidAttemptCount: 2 });
  const text = JSON.stringify(payload);
  assert.match(text, /7\.9\.6/);
  assert.match(text, /modrinth\.com/);
  assert.match(text, /26\.1\.2/);
});

test('third distinct invalid attempt escalates to jar filename screenshot and log help without shaming', () => {
  const payload = buildProgressAcknowledgement({ ownerId: '123', messageId: '999', diagnosis, invalidAttemptCount: 3 });
  const text = JSON.stringify(payload);
  assert.match(text, /complete MCA JAR filename/i);
  assert.match(text, /screenshot/i);
  assert.match(text, /latest\.log/i);
  assert.doesNotMatch(text, /failed|wrong again|cannot follow/i);
});

test('invalid catalogue values are explained directly instead of saying both versions are merely missing', () => {
  const invalidDiagnosis = {
    complete: false,
    missing: [
      'a Minecraft version supported by MCA Reborn',
      'a listed MCA Reborn version or complete development JAR filename',
    ],
    detected: [],
    reasons: [],
    invalid: [
      'Minecraft `1.23.4` is not supported by any listed MCA Reborn release on Modrinth.',
      'MCA Reborn `7.8.304` is not a listed public release. If this is a development build, send the complete MCA JAR filename or an explicit MCA+Minecraft pair.',
    ],
  };
  const payload = buildProgressAcknowledgement({
    ownerId: '123',
    messageId: '999',
    diagnosis: invalidDiagnosis,
    invalidAttemptCount: 2,
  });
  assert.match(payload.content, /couldn.t verify/i);
  assert.match(payload.content, /1\.23\.4/);
  assert.match(payload.content, /7\.8\.304/);
  assert.match(payload.content, /complete MCA JAR filename/i);
  assert.doesNotMatch(payload.content, /I still need MCA Reborn version and Minecraft version listed/i);
});
