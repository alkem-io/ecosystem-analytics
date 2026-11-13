import { describe, it, expect } from 'vitest';
import { appsForRequest } from './request-apps.js';

const req = (path: string, query: Record<string, unknown> = {}, body: unknown = undefined) => ({
  path,
  query,
  body,
});

describe('appsForRequest', () => {
  it('always includes the listener app', () => {
    expect(appsForRequest('explorer', req('/api/spaces'))).toEqual(['explorer']);
    expect(appsForRequest('vng', req('/api/spaces'))).toEqual(['vng']);
  });

  it('adds the app named by an /api/<app>/ path, on any listener', () => {
    expect(appsForRequest('explorer', req('/api/vng/dashboard'))).toEqual(['explorer', 'vng']);
    expect(appsForRequest('explorer', req('/api/govtech/initiatives'))).toEqual([
      'explorer',
      'govtech',
    ]);
    expect(appsForRequest('vng', req('/api/vng/dashboard'))).toEqual(['vng']);
  });

  it('adds the app named by ?app= on /api/hubs', () => {
    expect(appsForRequest('explorer', req('/api/hubs', { app: 'vng' }))).toEqual([
      'explorer',
      'vng',
    ]);
    expect(appsForRequest('explorer', req('/api/hubs/abc/spaces', { app: 'govtech' }))).toEqual([
      'explorer',
      'govtech',
    ]);
  });

  it('adds the app named by body.app on /api/graph/*', () => {
    expect(
      appsForRequest('explorer', req('/api/graph/generate', {}, { app: 'vng', spaceIds: ['x'] })),
    ).toEqual(['explorer', 'vng']);
    expect(appsForRequest('explorer', req('/api/graph/activity', {}, { app: 'govtech' }))).toEqual([
      'explorer',
      'govtech',
    ]);
  });

  it('adds nothing for a graph request that names no app (the Explorer path, FR-012a)', () => {
    expect(appsForRequest('explorer', req('/api/graph/generate', {}, { spaceIds: ['x'] }))).toEqual(
      ['explorer'],
    );
  });

  it('ignores unknown app names everywhere', () => {
    expect(appsForRequest('explorer', req('/api/hubs', { app: 'nope' }))).toEqual(['explorer']);
    expect(appsForRequest('explorer', req('/api/graph/generate', {}, { app: 'evil' }))).toEqual([
      'explorer',
    ]);
    expect(appsForRequest('explorer', req('/api/nope/dashboard'))).toEqual(['explorer']);
  });

  it('only reads ?app= on /api/hubs and body.app on /api/graph', () => {
    expect(appsForRequest('explorer', req('/api/spaces', { app: 'vng' }))).toEqual(['explorer']);
    expect(appsForRequest('explorer', req('/api/spaces', {}, { app: 'vng' }))).toEqual([
      'explorer',
    ]);
  });

  it('never names an app for /api/ecosystem/*', () => {
    expect(
      appsForRequest('explorer', req('/api/ecosystem/orchestrator/vih-test', { app: 'vng' })),
    ).toEqual(['explorer']);
  });

  it('de-duplicates when several signals name the same app', () => {
    expect(appsForRequest('vng', req('/api/hubs', { app: 'vng' }))).toEqual(['vng']);
  });

  it('ignores non-string app values', () => {
    expect(appsForRequest('explorer', req('/api/hubs', { app: ['vng'] }))).toEqual(['explorer']);
    expect(appsForRequest('explorer', req('/api/graph/generate', {}, { app: 1 }))).toEqual([
      'explorer',
    ]);
    expect(appsForRequest('explorer', req('/api/graph/generate', {}, null))).toEqual(['explorer']);
  });
});
