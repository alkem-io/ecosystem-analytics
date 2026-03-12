import type { EcosystemIndex, IndexedSpace, IndexedPerson, IndexedOrg } from '../types/query.js';

/**
 * Estimate the token count for a given text using the ~4 chars per token heuristic.
 * This is a rough approximation sufficient for budget checks.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatLocation(city: string | null, country: string | null): string {
  if (city && country) return ` in ${city}, ${country}`;
  if (city) return ` in ${city}`;
  if (country) return ` in ${country}`;
  return '';
}

function formatTags(label: string, tags: string[]): string {
  if (tags.length === 0) return '';
  return ` (${label}: ${tags.join(', ')})`;
}

function serializeSpace(space: IndexedSpace): string {
  const loc = formatLocation(space.city, space.country);
  const tags = formatTags('tags', space.tags);
  const vis = space.visibility ? ` | ${space.visibility}` : '';
  return `- [${space.id}] ${space.name}${tags}${loc} | ${space.memberCount} members, ${space.subspaceCount} subspaces${vis}`;
}

function serializePerson(person: IndexedPerson): string {
  const loc = formatLocation(person.city, person.country);
  const skills = formatTags('skills', person.skills);
  const roles = person.roles.length > 0
    ? ` | roles: ${person.roles.map((r) => `${r.spaceName}/${r.roleType}`).join(', ')}`
    : '';
  return `- [${person.id}] ${person.name}${skills}${loc}${roles}`;
}

function serializeOrg(org: IndexedOrg): string {
  const loc = formatLocation(org.city, org.country);
  const tags = formatTags('tags', org.tags);
  const roles = org.roles.length > 0
    ? ` | roles: ${org.roles.map((r) => `${r.spaceName}/${r.roleType}`).join(', ')}`
    : '';
  return `- [${org.id}] ${org.name}${tags}${loc}${roles}`;
}

/**
 * Serialize an EcosystemIndex into a compact text format for the LLM system prompt.
 * This format is ~40-60% smaller than JSON while remaining parseable by the LLM.
 */
export function serializeIndex(index: EcosystemIndex): string {
  const parts: string[] = [];

  parts.push(`SPACES (${index.spaces.length} total):`);
  for (const space of index.spaces) {
    parts.push(serializeSpace(space));
  }

  parts.push('');
  parts.push(`PEOPLE (${index.people.length} total):`);
  for (const person of index.people) {
    parts.push(serializePerson(person));
  }

  parts.push('');
  parts.push(`ORGANIZATIONS (${index.organizations.length} total):`);
  for (const org of index.organizations) {
    parts.push(serializeOrg(org));
  }

  return parts.join('\n');
}
