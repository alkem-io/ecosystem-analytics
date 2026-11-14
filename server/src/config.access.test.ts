/**
 * Features 026 + 027 — the `access:` block. Every application must be declared explicitly
 * (its viewer Spaces or `none`); anything else stops start-up (FR-003). The checked-in
 * defaults are the production policy: only the VNG dashboard is gated, viewers and admins
 * both by the Programmagroei Space.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseAccessConfig } from './config.js';

// Keep the developer's local .env out of the YAML-default test.
vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));

const LIM = {
  path: ['programmagroei', 'landelijkinnovatiemonitor'],
  key: 'programmagroei/landelijkinnovatiemonitor',
};
const PG = { path: ['programmagroei'], key: 'programmagroei' };

describe('parseAccessConfig', () => {
  const valid = {
    explorer: 'none',
    vng: 'programmagroei/landelijkinnovatiemonitor',
    govtech: 'none',
  };

  it('parses explicit viewer Spaces and explicit `none` per app', () => {
    const cfg = parseAccessConfig({ ...valid, vng_display_name: 'LIM', check_timeout_ms: 2500 });
    expect(cfg.apps.explorer).toEqual({ sets: null, displayNames: [] });
    expect(cfg.apps.govtech.sets).toBeNull();
    expect(cfg.apps.vng).toEqual({
      sets: { viewers: [LIM], admins: [], setKey: `v:${LIM.key}|a:` },
      displayNames: ['LIM'],
    });
    expect(cfg.checkTimeoutMs).toBe(2500);
  });

  it('parses several viewer Spaces and an admin set', () => {
    const cfg = parseAccessConfig({
      ...valid,
      vng: 'programmagroei, programmagroei/landelijkinnovatiemonitor',
      vng_admin: 'programmagroei',
      vng_display_name: 'Kenniscentrum',
      vng_display_names: 'Monitor',
    });
    expect(cfg.apps.vng.sets).toEqual({
      viewers: [PG, LIM],
      admins: [PG],
      setKey: `v:programmagroei,${LIM.key}|a:programmagroei`,
    });
    expect(cfg.apps.vng.displayNames).toEqual(['Kenniscentrum', 'Monitor']);
  });

  it('accepts an Alkemio URL as a viewer Space', () => {
    const cfg = parseAccessConfig({
      ...valid,
      vng: 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
    });
    expect(cfg.apps.vng.sets?.viewers).toEqual([LIM]);
  });

  it('treats an empty admin value as "nobody can manage"', () => {
    expect(parseAccessConfig({ ...valid, vng_admin: '' }).apps.vng.sets?.admins).toEqual([]);
  });

  it('defaults the timeout to 5 s', () => {
    expect(parseAccessConfig(valid).checkTimeoutMs).toBe(5000);
  });

  it.each(['explorer', 'vng', 'govtech'])('fails when access.%s is missing', (app) => {
    const block: Record<string, unknown> = { ...valid };
    delete block[app];
    expect(() => parseAccessConfig(block)).toThrow(`access.${app} is not set`);
  });

  it('fails when a value is empty (an env var set to nothing)', () => {
    expect(() => parseAccessConfig({ ...valid, vng: '' })).toThrow('access.vng is not set');
    expect(() => parseAccessConfig({ ...valid, vng: '   ' })).toThrow('access.vng is not set');
  });

  it('fails when a value cannot be parsed, naming the key', () => {
    expect(() => parseAccessConfig({ ...valid, vng: 'nope///' })).toThrow(/^access\.vng: /);
    expect(() => parseAccessConfig({ ...valid, govtech: 'a/b/c/d' })).toThrow(/^access\.govtech: /);
    expect(() => parseAccessConfig({ ...valid, vng_admin: 'a,,b' })).toThrow(/^access\.vng_admin: /);
  });

  it('fails on a Space listed twice within a set', () => {
    expect(() => parseAccessConfig({ ...valid, vng: 'a, a' })).toThrow(/listed twice/);
    expect(() => parseAccessConfig({ ...valid, vng_admin: 'a, a' })).toThrow(/listed twice/);
  });

  it('allows the same Space in both sets', () => {
    const cfg = parseAccessConfig({ ...valid, vng: 'a', vng_admin: 'a' });
    expect(cfg.apps.vng.sets?.setKey).toBe('v:a|a:a');
  });

  it('fails when an admin set is given for an ungated app', () => {
    expect(() => parseAccessConfig({ ...valid, govtech_admin: 'a' })).toThrow(
      /access\.govtech_admin is set while access\.govtech is 'none'/,
    );
  });

  it('fails when the whole block is absent', () => {
    expect(() => parseAccessConfig(undefined)).toThrow('access.explorer is not set');
  });
});

describe('access defaults in analytics.yml (the production policy)', () => {
  const keys = [
    'EXPLORER_ACCESS_GATE',
    'VNG_ACCESS_GATE',
    'VNG_ADMIN_GATE',
    'VNG_ACCESS_GATE_NAME',
    'VNG_ACCESS_GATE_NAMES',
    'GOVTECH_ACCESS_GATE',
  ];
  const saved: Record<string, string | undefined> = {};
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('gates only the VNG dashboard: viewers and admins by the Programmagroei Space', async () => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
    const { loadConfig } = await import('./config.js');
    const { apps } = loadConfig().access;
    expect(apps.explorer.sets).toBeNull();
    expect(apps.govtech.sets).toBeNull();
    expect(apps.explorer.sets?.admins ?? []).toEqual([]);
    expect(apps.vng.sets?.viewers).toEqual([PG]);
    expect(apps.vng.sets?.admins).toEqual([PG]);
    expect(apps.vng.displayNames).toEqual(['Kenniscentrum Innovatie']);
  });
});
