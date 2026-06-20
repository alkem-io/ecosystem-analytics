/**
 * Generate the committed VNG snapshot registry (gemeentes + themes) from the
 * `vng-gemeente-delers` vault. See specs/016-vng-frontend/contracts/snapshot-registry.md.
 *
 * Reads vault frontmatter (read-only) and writes three deterministic JSON files
 * under server/src/data/vng/. Re-run when the municipality/theme set changes and
 * commit the result — this is a DATA update, not a logic change (FR-033).
 *
 *   pnpm -C server run gen:vng-snapshot [pathToVault]
 *   VNG_GD_VAULT_PATH=/path/to/vng-gemeente-delers pnpm -C server run gen:vng-snapshot
 *
 * Contains only public reference data (no tokens, no user data).
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import YAML from 'yaml';

const SCRIPT_DIR = import.meta.dirname;
const DEFAULT_VAULT = join(SCRIPT_DIR, '../../../vng-gemeente-delers');
const OUT_DIR = join(SCRIPT_DIR, '../src/data/vng');

const PROGRAMME = {
  name: 'GemeenteDelers',
  years: '2021–2025',
  sourceUrl: 'https://vng.nl/praktijkvoorbeelden',
};

interface Municipality {
  slug: string;
  title: string;
  alkemioNameId: string | null;
  cbsCode: string | null;
}
interface Theme {
  slug: string;
  title: string;
  priorLabels: string[];
}

/** Parse the leading `---` YAML frontmatter block of a markdown file. */
function parseFrontmatter(filePath: string): Record<string, unknown> | null {
  const raw = readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return (YAML.parse(match[1]) ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Strip a trailing " (N)" backlink-count suffix some vault titles carry. */
function stripCountSuffix(value: string): string {
  return value.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) throw new Error(`Expected vault directory not found: ${dir}`);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => join(dir, f))
    .sort();
}

function countMarkdownRecursive(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) n += countMarkdownRecursive(p);
    else if (entry.endsWith('.md') && !entry.startsWith('_')) n += 1;
  }
  return n;
}

function buildMunicipalities(vault: string): Municipality[] {
  const dir = join(vault, 'vault/municipalities');
  const out: Municipality[] = [];
  for (const file of listMarkdown(dir)) {
    const fm = parseFrontmatter(file);
    if (!fm || fm.type !== 'municipality') continue;
    const title = String(fm.gemeente_name ?? stripCountSuffix(String(fm.title ?? '')));
    if (!title) continue;
    out.push({
      slug: basename(file, '.md'),
      title,
      alkemioNameId: fm.alkemio_nameid ? String(fm.alkemio_nameid) : null,
      cbsCode: fm.cbs_code ? String(fm.cbs_code) : null,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

function buildThemes(vault: string): Theme[] {
  const dir = join(vault, 'vault/gemeentedelers/themes');
  const out: Theme[] = [];
  for (const file of listMarkdown(dir)) {
    const fm = parseFrontmatter(file);
    if (!fm || fm.type !== 'theme') continue;
    const title = String(fm.vng_label ?? stripCountSuffix(String(fm.title ?? '')));
    if (!title) continue;
    const priorRaw = Array.isArray(fm.vng_prior_labels) ? fm.vng_prior_labels : [];
    out.push({
      slug: basename(file, '.md'),
      title,
      priorLabels: priorRaw.map((p) => String(p)).filter(Boolean),
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

function main(): void {
  const vault = process.argv[2] || process.env.VNG_GD_VAULT_PATH || DEFAULT_VAULT;
  if (!existsSync(vault)) {
    console.error(
      `vng-gemeente-delers vault not found at: ${vault}\n` +
        `Pass a path: pnpm -C server run gen:vng-snapshot /path/to/vng-gemeente-delers`,
    );
    process.exit(1);
  }

  const municipalities = buildMunicipalities(vault);
  const themes = buildThemes(vault);
  const initiativeCount = countMarkdownRecursive(join(vault, 'vault/gemeentedelers/initiatives'));

  if (municipalities.length === 0 || themes.length === 0) {
    console.error('Refusing to write: parsed 0 municipalities or 0 themes (vault layout changed?).');
    process.exit(1);
  }

  const meta = {
    generatedFrom: 'vng-gemeente-delers',
    municipalityCount: municipalities.length,
    themeCount: themes.length,
    initiativeCountAtGeneration: initiativeCount,
    programme: PROGRAMME,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const write = (name: string, data: unknown) =>
    writeFileSync(join(OUT_DIR, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
  write('municipalities.json', municipalities);
  write('themes.json', themes);
  write('meta.json', meta);

  console.log(
    `Wrote ${OUT_DIR}:\n` +
      `  municipalities.json (${municipalities.length})\n` +
      `  themes.json (${themes.length})\n` +
      `  meta.json (initiatives at generation: ${initiativeCount})`,
  );
}

main();
