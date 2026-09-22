import { describe, it, expect } from 'vitest';
import { LoadReporter, type ProgressEvent } from './load-reporter.js';

describe('LoadReporter (feature 025)', () => {
  it('emits events in call order and mirrors them into the legacy GraphProgress shape', () => {
    const events: ProgressEvent[] = [];
    const r = new LoadReporter((e) => events.push(e));
    r.loading(0, 3, 'a');
    expect(r.toGraphProgress()).toEqual({ step: 'acquiring', spacesTotal: 3, spacesCompleted: 0, currentSpace: 'a' });
    r.loading(3, 3);
    r.processing();
    expect(r.toGraphProgress()).toEqual({ step: 'transforming', spacesTotal: 3, spacesCompleted: 3, currentSpace: undefined });
    r.itemLoading('gd-initiatives');
    r.itemFailed('gd-initiatives', { key: 'load.failed.gd-initiatives' });
    r.itemDone('spaces');
    expect(r.toGraphProgress().step).toBe('ready');
    expect(events.map((e) => `${e.item}/${e.stage}`)).toEqual([
      'spaces/loading',
      'spaces/loading',
      'spaces/processing',
      'gd-initiatives/loading',
      'gd-initiatives/failed',
      'spaces/done',
    ]);
  });

  it('a cached-only load reports processing without any loading stage (SC-002a evidence)', () => {
    const events: ProgressEvent[] = [];
    const r = new LoadReporter((e) => events.push(e));
    r.processing();
    r.itemDone('spaces');
    expect(events.some((e) => e.stage === 'loading')).toBe(false);
  });

  it('works with no sink at all (the Explorer JSON path)', () => {
    const r = new LoadReporter();
    expect(() => r.loading(1, 2)).not.toThrow();
  });
});
