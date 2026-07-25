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
