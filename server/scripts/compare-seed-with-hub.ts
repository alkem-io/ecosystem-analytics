/**
 * Compare the monitor's starting set with an innovation hub's Space list (feature 027,
 * quickstart P3), or write the starting set from it.
 *
 *   pnpm tsx scripts/compare-seed-with-hub.ts [hubNameId=vih-test]
 *   pnpm tsx scripts/compare-seed-with-hub.ts vih-test --write
 *
 * Reads the hub anonymously; if the hub is not anonymously readable, set
 * ALKEMIO_ACCESS_TOKEN to a bearer token (never committed, never logged).
 * Endpoint: ALKEMIO_GRAPHQL_ENDPOINT (default production).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GraphQLClient } from 'graphql-request';
import { getSdk } from '../src/graphql/generated/graphql.js';

const SEED = join(import.meta.dirname, '../src/data/vng/monitor-settings.seed.json');
const args = process.argv.slice(2);
const write = args.includes('--write');
const hubNameId = args.find((a) => !a.startsWith('--')) ?? 'vih-test';
const endpoint = process.env.ALKEMIO_GRAPHQL_ENDPOINT || 'https://alkem.io/api/private/graphql';
const token = process.env.ALKEMIO_ACCESS_TOKEN;

/** graphql-request throws on partial results; keep the data part when there is one. */
function partial<T>(err: unknown): T | undefined {
  return (err as { response?: { data?: T } })?.response?.data;
}

async function hubSpaces(): Promise<string[]> {
  const client = new GraphQLClient(endpoint, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const sdk = getSdk(client);
  const id = (await sdk.InnovationHubByNameId({ nameId: hubNameId })).data.lookupByName
    .innovationHub;
  if (!id) throw new Error(`hub '${hubNameId}' did not resolve (try ALKEMIO_ACCESS_TOKEN)`);
  type Q = Awaited<ReturnType<typeof sdk.InnovationHubById>>['data'];
  let data: Q | undefined;
  try {
    data = (await sdk.InnovationHubById({ id })).data;
  } catch (err) {
    data = partial<Q>(err);
    if (!data?.lookup?.innovationHub) throw err;
    console.warn('warning: partial result — some listed Spaces were not readable');
  }
  return (data.lookup.innovationHub?.spaceListFilter ?? [])
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => s.nameID);
}

const live = await hubSpaces();

if (write) {
  const seed = { version: 1, ecosystemKey: hubNameId, includedSpaces: live };
  writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
  console.log(`wrote ${SEED}: ${live.length} Spaces from '${hubNameId}'`);
  process.exit(0);
}

if (!existsSync(SEED)) {
  console.error(`no starting set at ${SEED} — run with --write`);
  process.exit(2);
}
const seeded = (JSON.parse(readFileSync(SEED, 'utf8')) as { includedSpaces: string[] })
  .includedSpaces;

const same = seeded.length === live.length && seeded.every((n, i) => n === live[i]);
if (same) {
  console.log(`OK: ${live.length} Spaces, same order`);
  process.exit(0);
}
const missing = live.filter((n) => !seeded.includes(n));
const extra = seeded.filter((n) => !live.includes(n));
console.log(`DIFFERENT: hub '${hubNameId}' has ${live.length}, starting set has ${seeded.length}`);
if (missing.length) console.log(`  in the hub, not in the starting set: ${missing.join(', ')}`);
if (extra.length) console.log(`  in the starting set, not in the hub: ${extra.join(', ')}`);
if (!missing.length && !extra.length) console.log('  same Spaces, different order');
process.exit(1);
