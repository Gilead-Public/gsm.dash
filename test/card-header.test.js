import { describe, expect, it } from 'vitest';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';
import { PortfolioStore } from '../src/data/store.js';
import '../src/widgets/index.js';
import { studyCards } from '../src/app/study-cards.js';
import { cardValueTip } from '../src/app/card-value.js';
import { sparkline } from '../src/charts/sparkline.js';
import { pooled, shownMetrics } from './qual/pooling.js';

const portfolio = generatePortfolio();
const { manifest, snapshots } = portfolio;
const files = new Map(
  manifest.studies.flatMap((s) => Object.entries(s.files).map(([date, path]) => [path, snapshots.find((x) => x.StudyID === s.StudyID && x.SnapshotDate === date)])),
);
const read = (path) => files.get(path);
const shown = shownMetrics(manifest.metrics);
const inactive = manifest.metrics.filter((m) => m.Active === false);
const metrics = [...new Map(studyCards({ metrics: shown, inactive, visible: shown }).map((c) => [c.metric.ID, c.metric])).values()];

/** The path's y coordinates, scaled so its lowest point is 0 and its highest 1. */
function shape(d) {
  const ys = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return ys.map((y) => (bottom === top ? 0.5 : (bottom - y) / (bottom - top)));
}

describe('a card\'s value hover (#48)', () => {
  const int = (x) => x.toLocaleString('en-US');
  /** Exposure days as 28-day periods, to one decimal, rounded from the unrounded sum. */
  const periods = (days) => (Math.round((days / 28) * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const text = (html) => html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

  it('48.03: names n and N with the catalog\'s labels, N per 28 days as periods of exposure beside the exposure days, each equal to an independent pooling, for every study and card metric (#48)', () => {
    const store = new PortfolioStore(portfolio);
    let per28 = 0;
    for (const study of manifest.studies) {
      const date = store.latestDate(study.StudyID);
      for (const m of metrics) {
        const p = pooled(read, [study], m.MetricID, null);
        const tip = cardValueTip(m, store.studyRollup(study.StudyID, date, m.MetricID));
        const lines = text(/** @type {string} */ (tip)).split('\n');
        const where = `${study.StudyID} ${m.ID}`;
        expect(lines[1], where).toBe(`${int(p.numerator)} · ${m.Numerator}`);
        if (m.Display === 'per_28d') {
          per28++;
          expect(lines[2], where).toBe(`${periods(p.denominator)} · 28-day periods of exposure (${int(p.denominator)} exposure days)`);
        } else expect(lines[2], where).toBe(`${int(p.denominator)} · ${m.Denominator}`);
      }
    }
    expect(per28).toBeGreaterThan(0);
    expect(cardValueTip(metrics[0], null)).toBeNull();
  });

  it('the portfolio\'s sparkline, without gaps, still joins the values it has, evenly spaced, and counts only them', () => {
    const el = { innerHTML: '', textContent: '' };
    sparkline(el, [0.02, 0.05, null, 0.03].map((rate, i) => ({ date: `2026-0${i + 1}-01`, rate })), { label: 'Portfolio trend' });
    expect(el.innerHTML).toContain('aria-label="Portfolio trend: 3 snapshots, latest 3.0%"');
    const d = /<path d="([^"]+)" class="spark-line"/.exec(el.innerHTML)?.[1] ?? '';
    expect(shape(d).map((y) => Number(y.toFixed(2)))).toEqual([0, 1, 0.33]);
    expect(d.split('M')).toHaveLength(2);
  });

});
