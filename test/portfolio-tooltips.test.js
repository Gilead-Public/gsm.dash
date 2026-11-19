import { describe, expect, it } from 'vitest';
import { PortfolioStore } from '../src/data/store.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';
import { cellTip, metricHeadTip, tableRows, tileTip } from '../src/app/portfolio-table.js';
import { metricTip } from '../src/app/tooltip.js';

const portfolio = generatePortfolio();
const metric = portfolio.manifest.metrics.find((m) => m.Display === 'count_pct');
const rate28 = portfolio.manifest.metrics.find((m) => m.Display === 'per_28d');
const technical = (m) => [m.MetricID, m.ID, m.Score, m.Threshold].filter(Boolean);

describe('the portfolio glossary entry (#20)', () => {
  it('leaves out the metric IDs and the flagging row, and keeps the rest', () => {
    const tip = metricTip(metric, { technical: false });
    for (const field of technical(metric)) expect(tip).not.toContain(field);
    expect(tip).not.toContain('Flagging');
    for (const field of [metric.Metric, metric.Definition, metric.Numerator, metric.Denominator, 'Displayed as'].filter(Boolean)) expect(tip).toContain(field);
  });

  it('is unchanged for the study report', () => {
    const tip = metricTip(metric);
    for (const field of [metric.ID, 'Flagging', metric.Score]) expect(tip).toContain(field);
  });

  it('is the header tooltip, with how the column sorts and nothing about an info icon', () => {
    const tip = metricHeadTip(metric, 'rate');
    expect(tip.startsWith(metricTip(metric, { technical: false }))).toBe(true);
    expect(tip).toContain('Click to sort by rate.');
    expect(tip).not.toContain('ⓘ');
  });
});

describe('cell and tile hovers (#20)', () => {
  const rollup = { Numerator: 1234, Denominator: 56789, Rate: 1234 / 56789, NumStudies: 3 };

  it('name the denominator with the catalog label, and drop Σn/Σd', () => {
    for (const m of [metric, rate28]) {
      for (const tip of [cellTip(rollup, m, 'Portfolio total'), tileTip('Portfolio total', m, rollup)]) {
        expect(tip).toContain(`1,234 / 56,789 <span class="tip-muted">(${m.Denominator})</span>`);
        expect(tip).not.toContain('Σ');
      }
    }
  });

  it('keep the per-28-day wording', () => {
    expect(cellTip(rollup, rate28, 'Portfolio total')).toContain(`= ${rollup.Rate.toFixed(4)} / day × 28`);
  });
});

describe('table rows without the Snapshot column (#20)', () => {
  it('give study rows their snapshot date but no Studies value, so sorting by Studies orders only groups', () => {
    const store = new PortfolioStore(portfolio);
    const flat = tableRows(store);
    expect(flat.primary.every((r) => r.kind === 'study' && r.meta === null && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)))).toBe(true);
    const unsorted = flat.primary.map((r) => r.label);
    store.state.sort = { key: 'meta', dir: 'desc' };
    expect(tableRows(store).primary.map((r) => r.label)).toEqual(unsorted);
    store.set('groupBy', 'phase');
    const groups = tableRows(store).primary;
    expect(groups.map((r) => r.meta)).toEqual([...groups.map((r) => r.meta)].sort((a, b) => b - a));
    expect(groups.flatMap((r) => r.children).every((r) => r.meta === null)).toBe(true);
  });
});
