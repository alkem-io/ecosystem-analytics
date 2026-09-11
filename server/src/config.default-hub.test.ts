/**
 * The built-in VNG default hub must be the PRODUCTION hub, so a deployment whose env
 * forgets VNG_DEFAULT_HUB_NAMEID still preselects the right hub on alkem.io.
 * (Acceptance sets the var explicitly — its hub carries a different nameID.)
 */
import { describe, it, expect, vi } from 'vitest';

// Keep the developer's local .env out of this test: the point is what the YAML falls
// back to when the variable is genuinely absent.
vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));

describe('VNG default hub fallback', () => {
  it('falls back to vih-test when VNG_DEFAULT_HUB_NAMEID is absent', async () => {
    vi.resetModules();
    const saved = process.env.VNG_DEFAULT_HUB_NAMEID;
    delete process.env.VNG_DEFAULT_HUB_NAMEID;
    try {
      const { loadConfig } = await import('./config.js');
      expect(loadConfig().dashboards.vng.defaultHubNameId).toBe('vih-test');
    } finally {
      if (saved !== undefined) process.env.VNG_DEFAULT_HUB_NAMEID = saved;
    }
  });
});
