import { describe, it, expect } from 'vitest';
import { registerWidget, resolveWidget, missingLayers } from '../src/widgets/registry.js';
import { deriveWatchSites } from '../src/widgets/threshold-list.js';

// Importing the widget modules registers the shipped set.
import '../src/widgets/index.js';

const EXEC = ['results', 'details', 'external'];

describe('widget registry + allow-list resolution', () => {
  it('resolves registered widgets whose dataSpec the host allows', () => {
    expect(resolveWidget('breakdown-bar', EXEC)).toMatchObject({ degraded: false });
    expect(resolveWidget('threshold-list', EXEC).def.name).toBe('threshold-list');
  });

  it('falls back to scalar-tile for unknown names', () => {
    const { def, degraded } = resolveWidget('no-such-widget', EXEC);
    expect(def.name).toBe('scalar-tile');
    expect(degraded).toBe(true);
  });

  it('undefined name means the default widget, not a degrade', () => {
    expect(resolveWidget(undefined, EXEC)).toMatchObject({ degraded: false });
  });

  it('degrades along the fallback chain when a layer is disallowed (W2)', () => {
    registerWidget({
      name: 'test-listings-widget',
      dataSpec: { results: 'self', listings: 'self' },
      fallback: 'link-out',
      render() {},
    });
    // Exec build: listings disallowed -> falls back to link-out (allowed).
    const exec = resolveWidget('test-listings-widget', EXEC);
    expect(exec.def.name).toBe('link-out');
    expect(exec.degraded).toBe(true);
    // Study-team build: listings allowed -> runs as itself.
    const team = resolveWidget('test-listings-widget', [...EXEC, 'listings']);
    expect(team.def.name).toBe('test-listings-widget');
    expect(team.degraded).toBe(false);
  });

  it('missingLayers names exactly the disallowed layers', () => {
    expect(missingLayers({ results: 'self', listings: 'self' }, EXEC)).toEqual(['listings']);
    expect(missingLayers({ results: 'self' }, EXEC)).toEqual([]);
  });
});

describe('deriveWatchSites (derivation widget — W3/W8 unit-test tier)', () => {
  const metrics = [
    { MetricID: 'M1', Abbreviation: 'AE' },
    { MetricID: 'M2', Abbreviation: 'PD' },
    { MetricID: 'M3', Abbreviation: 'QRY' },
  ];
  const rows = new Map([
    ['M1', [{ GroupID: 'S1', Flag: 2 }, { GroupID: 'S2', Flag: 0 }, { GroupID: 'S3', Flag: -1 }]],
    ['M2', [{ GroupID: 'S1', Flag: -1 }, { GroupID: 'S2', Flag: 1 }, { GroupID: 'S3', Flag: null }]],
    ['M3', [{ GroupID: 'S1', Flag: 0 }, { GroupID: 'S2', Flag: 2 }]],
  ]);

  it('counts amber+red flags per site and applies the threshold', () => {
    const sites = deriveWatchSites(rows, metrics, { threshold: 2 });
    expect(sites.map((s) => s.GroupID)).toEqual(['S1', 'S2']); // both at 2; S3 has 1
    expect(sites[0].abbrs).toEqual(['AE', 'PD']);
  });

  it('ignores green and NA flags', () => {
    const sites = deriveWatchSites(rows, metrics, { threshold: 1 });
    const s3 = sites.find((s) => s.GroupID === 'S3');
    expect(s3.count).toBe(1); // only the M1 amber; the M2 null is NA
  });
});
