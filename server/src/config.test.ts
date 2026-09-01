import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

/**
 * Feature 017: the single BFF keeps shared Alkemio/OIDC/session config but exposes
 * an app-keyed `dashboards` registry so each Dutch dashboard (VNG, GovTech) has its
 * OWN independent profile (separate env vars), plus a third served port.
 */
describe('config — dashboard app registry (feature 017)', () => {
  const config = loadConfig();

  it('exposes both vng and govtech dashboard profiles', () => {
    expect(config.dashboards).toBeTruthy();
    expect(config.dashboards.vng).toBeTruthy();
    expect(config.dashboards.govtech).toBeTruthy();
  });

  it('keeps `config.vng` as a back-compat alias of dashboards.vng', () => {
    expect(config.vng).toBe(config.dashboards.vng);
  });

  it('gives each app an INDEPENDENT default hub (separate env vars, not shared)', () => {
    // .env sets VNG_DEFAULT_HUB_NAMEID; GOVTECH_DEFAULT_HUB_NAMEID is unset → operator-set/empty.
    expect(config.dashboards.vng.defaultHubNameId).not.toBe('');
    expect(config.dashboards.govtech.defaultHubNameId).toBe('');
    expect(config.dashboards.govtech.defaultHubNameId).not.toBe(config.dashboards.vng.defaultHubNameId);
  });

  it('defaults GovTech to the SAME gemeentedelers corpus as VNG (shared data source)', () => {
    expect(config.dashboards.govtech.gemeentedelersSpaceNameId).toBe('gemeentedelers');
    expect(config.dashboards.govtech.gdCacheTtlHours).toBe(168);
  });

  it('seeds the GovTech classification designations as a working copy of VNG (FR-026)', () => {
    expect(config.dashboards.govtech.classifications).toEqual(config.dashboards.vng.classifications);
    expect(config.dashboards.govtech.classifications.nds).toBe('NDS');
    expect(config.dashboards.govtech.classifications.phase).toBe('Groeifase');
  });

  // FR-011: the per-dashboard tag→category keyword lists are retired outright — the
  // dashboard must boot and count with no such list configured anywhere.
  it('carries no tag→category keyword list on any dashboard profile', () => {
    for (const profile of Object.values(config.dashboards)) {
      expect(profile).not.toHaveProperty('tagCategoryMapping');
    }
  });

  it('serves the three frontends on contiguous ports (Explorer, VNG=+1, GovTech=+2)', () => {
    expect(config.vngPort).toBe(config.port + 1);
    expect(config.govtechPort).toBe(config.port + 2);
  });
});
