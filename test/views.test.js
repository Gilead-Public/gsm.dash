import { describe, it, expect } from 'vitest';
import { widgetKind, getWidget, listWidgets } from '../src/widgets/registry.js';
import { outlierSites } from '../src/widgets/views/bar-outliers.js';
import { flagCounts } from '../src/widgets/views/flag-dist.js';
import { STANDARD_TILE_VIEWS } from '../src/app/study-page-spec.js';
import '../src/widgets/index.js';

describe('standard vs custom is derived from data layers', () => {
  it('reporting-layer-only views are standard; details/external/listings make a view custom', () => {
    expect(widgetKind({ dataSpec: { results: 'self' } })).toBe('standard');
    expect(widgetKind({ dataSpec: { results: 'self', bounds: 'self', groups: 'self' } })).toBe('standard');
    expect(widgetKind({ dataSpec: { history: 'self' } })).toBe('standard');
    expect(widgetKind({ dataSpec: { results: 'self', details: 'self' } })).toBe('custom');
    expect(widgetKind({ dataSpec: { results: 'self', external: true } })).toBe('custom');
    expect(widgetKind({ dataSpec: { results: 'self', listings: 'self' } })).toBe('custom');
  });

  it('every standard tile view is registered, tile-format, and standard', () => {
    for (const name of STANDARD_TILE_VIEWS) {
      const def = getWidget(name);
      expect(def, name).not.toBeNull();
      expect(def.kind, name).toBe('standard');
      expect(def.format, name).toBe('tile');
    }
  });

  it('the shipped custom widgets classify as custom and the gsm.viz adapters as standard/wide', () => {
    expect(getWidget('breakdown-bar').kind).toBe('custom');
    expect(getWidget('link-out').kind).toBe('custom');
    expect(getWidget('threshold-list').kind).toBe('standard');
    for (const name of ['viz-bar', 'viz-scatter', 'viz-timeseries']) {
      expect(getWidget(name).kind, name).toBe('standard');
      expect(getWidget(name).format, name).toBe('wide');
    }
    expect(listWidgets().length).toBeGreaterThanOrEqual(13);
  });
});

describe('view derivations (pure)', () => {
  const rows = [
    { GroupID: 'S1', Flag: 2, Metric: 0.4 },
    { GroupID: 'S2', Flag: 0, Metric: 0.1 },
    { GroupID: 'S3', Flag: -1, Metric: 0.05 },
    { GroupID: 'S4', Flag: null, Metric: 0.2 },
    { GroupID: 'S5', Flag: 1, Metric: 0.3 },
  ];

  it('outlierSites keeps red/amber sites sorted by rate and counts the hidden rest', () => {
    const { outliers, hidden } = outlierSites(rows);
    expect(outliers.map((r) => r.GroupID)).toEqual(['S1', 'S5', 'S3']);
    expect(hidden).toBe(2); // the green site and the NA site
  });

  it('flagCounts buckets every flag level including NA', () => {
    const counts = flagCounts(rows);
    expect(counts.get(2)).toBe(1);
    expect(counts.get(1)).toBe(1);
    expect(counts.get(0)).toBe(1);
    expect(counts.get(-1)).toBe(1);
    expect(counts.get(-2)).toBe(0);
    expect(counts.get(null)).toBe(1);
  });
});
