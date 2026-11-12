import { describe, it, expect } from 'vitest';
import { registerWidget, resolveWidget, missingLayers } from '../src/widgets/registry.js';
import { deriveWatchSites } from '../src/widgets/threshold-list.js';

// Importing the widget modules registers the shipped set.
import '../src/widgets/index.js';

const EXEC = ['results', 'distributions', 'external'];

describe('widget registry + allow-list resolution', () => {
  const configured = { MetricID: 'Analysis_kri0012', ID: 'kri0012', Abbreviation: 'SF' };
  const plain = { MetricID: 'Analysis_kri0007', ID: 'kri0007', Abbreviation: 'TDSC' };

  it('resolves registered widgets whose dataSpec the host allows', () => {
    expect(resolveWidget('distribution-bar', EXEC, configured)).toMatchObject({ reason: null });
    expect(resolveWidget('threshold-list', EXEC).def.name).toBe('threshold-list');
  });

  it('substitutes nothing for an unknown name, and says why', () => {
    expect(resolveWidget('no-such-widget', EXEC)).toEqual({ def: null, reason: 'it is not a registered widget' });
    expect(resolveWidget(undefined, EXEC)).toEqual({ def: null, reason: 'it is not a registered widget' });
  });

  it('substitutes nothing when a layer is disallowed, and names the layer', () => {
    registerWidget({ name: 'test-listings-widget', dataSpec: { results: 'self', listings: 'self' }, render() {} });
    expect(resolveWidget('test-listings-widget', EXEC)).toEqual({ def: null, reason: 'it needs the listings data, which this page does not carry' });
    expect(resolveWidget('test-listings-widget', [...EXEC, 'listings']).def.name).toBe('test-listings-widget');
  });

  it('refuses a widget that does not apply to the metric: breakdowns without a configuration, a report link without a link', () => {
    expect(resolveWidget('distribution-bar', EXEC, plain)).toEqual({ def: null, reason: 'it has no breakdown configuration' });
    expect(resolveWidget('link-out', EXEC, plain, { label: 'report' })).toEqual({ def: null, reason: 'no report link is configured for it' });
    expect(resolveWidget('link-out', EXEC, { ...plain, ReportLink: 'report.html' }).def.name).toBe('link-out');
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
