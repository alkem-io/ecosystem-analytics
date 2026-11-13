/**
 * Feature 026 — the `access:` block. Every application must be declared explicitly
 * (a gate or `none`); anything else stops start-up (FR-003). The checked-in defaults
 * are the production policy: only the VNG dashboard is gated.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseAccessConfig } from './config.js';

// Keep the developer's local .env out of the YAML-default test.
vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));

const LIM = {
  path: ['programmagroei', 'landelijkinnovatiemonitor'],
  key: 'programmagroei/landelijkinnovatiemonitor',
};

describe('parseAccessConfig', () => {
  const valid = {
    explorer: 'none',
    vng: 'programmagroei/landelijkinnovatiemonitor',
    govtech: 'none',
  };

  it('parses an explicit gate and explicit `none` per app', () => {
    const cfg = parseAccessConfig({ ...valid, vng_display_name: 'LIM', check_timeout_ms: 2500 });
    expect(cfg.apps.explorer).toEqual({ gate: null, displayNameFallback: '' });
    expect(cfg.apps.govtech.gate).toBeNull();
    expect(cfg.apps.vng).toEqual({ gate: LIM, displayNameFallback: 'LIM' });
    expect(cfg.checkTimeoutMs).toBe(2500);
  });

  it('accepts an Alkemio URL as the gate', () => {
    const cfg = parseAccessConfig({
      ...valid,
      vng: 'https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor',
    });
    expect(cfg.apps.vng.gate).toEqual(LIM);
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
  });

  it('fails when the whole block is absent', () => {
    expect(() => parseAccessConfig(undefined)).toThrow('access.explorer is not set');
  });
});

describe('access defaults in analytics.yml (the production policy)', () => {
  const keys = ['EXPLORER_ACCESS_GATE', 'VNG_ACCESS_GATE', 'GOVTECH_ACCESS_GATE'];
  const saved: Record<string, string | undefined> = {};
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('gates only the VNG dashboard, by the Landelijk Innovatiemonitor subspace', async () => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
    const { loadConfig } = await import('./config.js');
    const { apps } = loadConfig().access;
    expect(apps.explorer.gate).toBeNull();
    expect(apps.govtech.gate).toBeNull();
    expect(apps.vng.gate).toEqual(LIM);
    expect(apps.vng.displayNameFallback).toBe('Landelijk Innovatie Monitor');
  });
});
