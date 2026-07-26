import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseVersions } from '../src/guidance/policy.js';

function result({ mc = [], mca = [], rejected = [], vague = [] } = {}) {
  const field = (values, rejectedValues = []) => ({
    status: values.length === 0 ? 'missing' : values.length === 1 ? 'present' : 'ambiguous',
    values,
    evidence: [],
    rejected: rejectedValues.map((value) => ({ value, reason: 'looks-like-minecraft-version' })),
  });
  return { minecraft: field(mc), mca: field(mca, rejected), vague };
}

test('marks exactly one Minecraft and MCA version complete', () => {
  assert.equal(diagnoseVersions(result({ mc: ['1.21.1'], mca: ['7.7.23'] })).complete, true);
});

test('describes missing and detected values', () => {
  const diagnosis = diagnoseVersions(result({ mc: ['1.21.1'] }));
  assert.deepEqual(diagnosis.missing, ['MCA Reborn version']);
  assert.deepEqual(diagnosis.detected, ['Minecraft: `1.21.1`']);
});

test('explains Minecraft-shaped values rejected as MCA', () => {
  const diagnosis = diagnoseVersions(result({ mc: ['1.20.1'], rejected: ['1.20.1'] }));
  assert.match(diagnosis.reasons.join(' '), /looks like a Minecraft version/i);
});

test('explains ambiguous Minecraft and MCA values', () => {
  const diagnosis = diagnoseVersions(result({ mc: ['1.20.1', '1.21.1'], mca: ['7.6.21', '7.7.23'] }));
  assert.match(diagnosis.reasons.join(' '), /multiple Minecraft versions/i);
  assert.match(diagnosis.reasons.join(' '), /multiple MCA Reborn versions/i);
});

test('explains vague latest wording', () => {
  const diagnosis = diagnoseVersions(result({ vague: ['latest'] }));
  assert.match(diagnosis.reasons.join(' '), /exact version/i);
});

import { normaliseModrinthVersions } from '../src/modrinth/catalogue.js';
import { detectThreadVersions } from '../src/version/detect.js';

const catalogue = normaliseModrinthVersions([
  {
    id: 'good', version_number: '7.7.22+1.21.1', game_versions: ['1.21.1'], loaders: ['neoforge'],
    version_type: 'release', status: 'listed', date_published: '2026-07-20T00:00:00Z', files: [{ primary: true, filename: 'good.jar' }],
  },
  {
    id: 'new-1211', version_number: '7.7.23+1.21.1', game_versions: ['1.21.1'], loaders: ['neoforge'],
    version_type: 'release', status: 'listed', date_published: '2026-07-21T00:00:00Z', files: [{ primary: true, filename: 'new-1211.jar' }],
  },
  {
    id: 'new', version_number: '7.9.6+26.1.2', game_versions: ['26.1.2'], loaders: ['fabric'],
    version_type: 'release', status: 'listed', date_published: '2026-07-21T00:00:00Z', files: [{ primary: true, filename: 'new.jar' }],
  },
]);

function detected(messages) {
  return detectThreadVersions({
    messages: messages.map((content, index) => ({
      position: index === 0 ? 'starter' : `reply-${index}`,
      authorKind: 'thread-owner', content, attachments: [],
    })),
  });
}

test('uses resolved latest pair rather than accumulated raw ambiguity', () => {
  const diagnosis = diagnoseVersions(detected(['26.1.2', '7.7.22+1.21.1']), catalogue);
  assert.equal(diagnosis.minecraftVersion, '1.21.1');
  assert.equal(diagnosis.mcaVersion, '7.7.22');
  assert.equal(diagnosis.complete, true);
});

test('keeps a known public Minecraft mismatch incomplete and recommends the matching branch', () => {
  const diagnosis = diagnoseVersions(detected(['7.7.22+26.1.2', 'fabric']), catalogue);
  assert.equal(diagnosis.compatibility, 'known-incompatible');
  assert.equal(diagnosis.complete, false);
  assert.match(diagnosis.reasons.join(' '), /does not match/i);
  assert.equal(diagnosis.recommendation.entry.mcaVersion, '7.9.6');
});

test('accepts an exact unknown build without blocking support', () => {
  const diagnosis = diagnoseVersions(detected(['9.9.9+26.1.2']), catalogue);
  assert.equal(diagnosis.compatibility, 'unknown-build');
  assert.equal(diagnosis.complete, true);
});

test('falls back to syntax-only completion when catalogue is unavailable', () => {
  const diagnosis = diagnoseVersions(detected(['7.7.22+1.21.1']), []);
  assert.equal(diagnosis.compatibility, 'catalogue-unavailable');
  assert.equal(diagnosis.complete, true);
});

test('fingerprint changes for meaningful version progress but not unrelated replies', () => {
  const first = diagnoseVersions(detected(['26.1.2']), catalogue);
  const unrelated = diagnoseVersions(detected(['26.1.2', 'h']), catalogue);
  const progressed = diagnoseVersions(detected(['26.1.2', '7.9.6']), catalogue);
  assert.equal(first.fingerprint, unrelated.fingerprint);
  assert.notEqual(first.fingerprint, progressed.fingerprint);
});

test('does not accept a standalone Minecraft version absent from listed Modrinth game versions', () => {
  const diagnosis = diagnoseVersions(detected(['26.9.9']), catalogue);
  assert.equal(diagnosis.complete, false);
  assert.equal(diagnosis.minecraftEligible, false);
  assert.equal(diagnosis.detected.some((value) => value.includes('26.9.9')), false);
  assert.match(diagnosis.missing.join(' '), /Minecraft version/i);
  assert.match(diagnosis.reasons.join(' '), /not listed.*Modrinth/i);
});

test('does not accept a bare MCA-shaped version absent from listed Modrinth releases', () => {
  const diagnosis = diagnoseVersions(detected(['7.8.304']), catalogue);
  assert.equal(diagnosis.complete, false);
  assert.equal(diagnosis.mcaEligible, false);
  assert.equal(diagnosis.detected.some((value) => value.includes('7.8.304')), false);
  assert.match(diagnosis.missing.join(' '), /MCA Reborn version/i);
  assert.match(diagnosis.invalid.join(' '), /7\.8\.304.*not a listed public release/i);
  assert.match(diagnosis.invalid.join(' '), /complete MCA JAR filename/i);
});

test('reports unsupported Minecraft and unverified bare MCA values as invalid rather than missing detections', () => {
  const diagnosis = diagnoseVersions(detected(['7.8.304', '1.23.4']), catalogue);
  assert.equal(diagnosis.complete, false);
  assert.equal(diagnosis.minecraftEligible, false);
  assert.equal(diagnosis.mcaEligible, false);
  assert.deepEqual(diagnosis.detected, []);
  assert.match(diagnosis.invalid.join(' '), /Minecraft `1\.23\.4`.*not supported/i);
  assert.match(diagnosis.invalid.join(' '), /MCA Reborn `7\.8\.304`.*not a listed public release/i);
});

test('keeps an explicit unknown development pair eligible even when its Minecraft branch is unpublished', () => {
  const diagnosis = diagnoseVersions(detected(['9.9.9+26.9.9']), catalogue);
  assert.equal(diagnosis.compatibility, 'unknown-build');
  assert.equal(diagnosis.complete, true);
});

const minecraftManifest = new Set(['1.21.1', '26.1.2', '26.2']);

test('marks a newer compatible MCA release as an optional update', () => {
  const diagnosis = diagnoseVersions(detected(['7.7.22+1.21.1', 'neoforge']), catalogue, minecraftManifest);
  assert.equal(diagnosis.complete, true);
  assert.equal(diagnosis.updateAvailable.entry.mcaVersion, '7.7.23');
});

test('rejects a version absent from Mojang without special-casing its number', () => {
  const diagnosis = diagnoseVersions(detected(['1.23.4']), catalogue, minecraftManifest);
  assert.equal(diagnosis.minecraftValidity, 'unknown-minecraft-version');
  assert.equal(diagnosis.minecraftEligible, false);
  assert.equal(diagnosis.detected.some((value) => value.includes('1.23.4')), false);
  assert.match(diagnosis.missing.join(' '), /recognised Minecraft Java version/i);
  assert.match(diagnosis.reasons.join(' '), /official Mojang.*manifest/i);
});

test('distinguishes a real Minecraft version with no public MCA support', () => {
  const diagnosis = diagnoseVersions(detected(['26.2']), catalogue, minecraftManifest);
  assert.equal(diagnosis.minecraftValidity, 'unsupported-by-mca');
  assert.equal(diagnosis.minecraftEligible, false);
  assert.match(diagnosis.reasons.join(' '), /exists.*no listed MCA Reborn release/i);
});

test('does not accept a bare unknown MCA-shaped number', () => {
  const diagnosis = diagnoseVersions(detected(['1.21.1', '7.8.304']), catalogue, minecraftManifest);
  assert.equal(diagnosis.mcaValidity, 'unverified-bare-build');
  assert.equal(diagnosis.mcaEligible, false);
  assert.equal(diagnosis.complete, false);
  assert.equal(diagnosis.detected.some((value) => value.includes('7.8.304')), false);
  assert.match(diagnosis.reasons.join(' '), /complete MCA JAR filename|complete MCA.*Minecraft pair/i);
});

test('accepts an unknown MCA build only with a strong pair and Mojang-valid Minecraft version', () => {
  const accepted = diagnoseVersions(detected(['7.8.304+1.21.1']), catalogue, minecraftManifest);
  assert.equal(accepted.compatibility, 'unknown-build');
  assert.equal(accepted.mcaValidity, 'unknown-build-with-strong-evidence');
  assert.equal(accepted.complete, true);

  const rejected = diagnoseVersions(detected(['7.8.304+1.23.4']), catalogue, minecraftManifest);
  assert.equal(rejected.minecraftValidity, 'unknown-minecraft-version');
  assert.equal(rejected.complete, false);
});
