import assert from 'node:assert/strict';
import test from 'node:test';

import { catalogueStats, checkCompatibility, createModrinthIndex, findLatestCompatible, normaliseModrinthVersions } from '../src/modrinth/catalogue.js';

function record({ id, version, minecraft, loader, type = 'release', date, status = 'listed' }) {
  return { id, version_number: version, game_versions: [minecraft], loaders: [loader], version_type: type, status, date_published: date };
}

const tuples = normaliseModrinthVersions([
  record({ id: 'old', version: '7.7.22+1.21.1', minecraft: '1.21.1', loader: 'fabric', date: '2026-07-01T00:00:00Z' }),
  record({ id: 'new-fabric', version: '7.7.23+1.21.1', minecraft: '1.21.1', loader: 'fabric', date: '2026-07-20T00:00:00Z' }),
  record({ id: 'new-neo', version: '7.7.24+1.21.1', minecraft: '1.21.1', loader: 'neoforge', date: '2026-07-21T00:00:00Z' }),
  record({ id: 'modern', version: '8.1.2+26.1.2', minecraft: '26.1.2', loader: 'neoforge', date: '2026-07-22T00:00:00Z' }),
  record({ id: 'hidden', version: '9.0.0+26.1.2', minecraft: '26.1.2', loader: 'neoforge', date: '2026-07-23T00:00:00Z', status: 'archived' }),
]);
const catalogue = createModrinthIndex(tuples);

test('normalises listed Modrinth records into compact tuples', () => {
  assert.deepEqual(tuples[0], ['7.7.22', ['1.21.1'], ['fabric'], 'r', Math.floor(Date.parse('2026-07-01T00:00:00Z') / 1000), 'old']);
  assert.equal(tuples.length, 4);
});

test('builds indexed MCA Minecraft and loader lookups', () => {
  assert.equal(catalogue.byMcaVersion.get('7.7.23').length, 1);
  assert.equal(catalogue.supportedMinecraftVersions.has('26.1.2'), true);
  assert.equal(catalogue.latestByMinecraftLoader.get('26.1.2\0neoforge').mcaVersion, '8.1.2');
});

test('verifies MCA Minecraft and loader alignment', () => {
  assert.equal(checkCompatibility(catalogue, { mcaVersion: '7.7.23', minecraftVersion: '1.21.1', loader: 'fabric' }).status, 'verified');
  assert.equal(checkCompatibility(catalogue, { mcaVersion: '7.7.23', minecraftVersion: '26.1.2', loader: 'fabric' }).status, 'known-incompatible');
  assert.equal(checkCompatibility(catalogue, { mcaVersion: '7.7.23', minecraftVersion: '1.21.1', loader: 'neoforge' }).status, 'known-incompatible');
});

test('reports a newer compatible MCA release without rejecting the current one', () => {
  const result = checkCompatibility(catalogue, { mcaVersion: '7.7.22', minecraftVersion: '1.21.1', loader: 'fabric' });
  assert.equal(result.status, 'verified');
  assert.equal(result.updateAvailable.entry.mcaVersion, '7.7.23');
});

test('accepts versions absent from the public catalogue as unknown builds', () => {
  assert.equal(checkCompatibility(catalogue, { mcaVersion: '99.0.0-dev', minecraftVersion: '26.1.2', loader: 'neoforge' }).status, 'unknown-build');
});

test('latest recommendation never crosses Minecraft branches or known loaders', () => {
  const latest = findLatestCompatible(catalogue, { minecraftVersion: '26.1.2', loader: 'neoforge' });
  assert.equal(latest.entry.mcaVersion, '8.1.2');
  assert.equal(latest.entry.minecraftVersions.includes('26.1.2'), true);
  assert.equal(latest.entry.loaders.includes('neoforge'), true);
});

test('unknown loader does not guess when latest releases differ', () => {
  assert.equal(findLatestCompatible(catalogue, { minecraftVersion: '1.21.1' }).status, 'loader-required');
});

test('reports indexed catalogue counts', () => {
  const stats = catalogueStats(catalogue);
  assert.equal(stats.recordCount, 4);
  assert.equal(stats.uniqueMcaVersionCount, 4);
  assert.equal(stats.minecraftVersionCount, 2);
  assert.deepEqual(stats.loaders, ['fabric', 'neoforge']);
});
