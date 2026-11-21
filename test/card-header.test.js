import { describe, expect, it } from 'vitest';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';
import { PortfolioStore } from '../src/data/store.js';
import '../src/widgets/index.js';
import { studyCards } from '../src/app/study-cards.js';
import { cardRate } from '../src/app/card-value.js';
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

describe('a card\'s sparkline (#32)', () => {
  it('32.09: each point is the study\'s value pooled independently at one of its snapshots up to the visit shown, for every study, card metric and visit (#32)', () => {
    const store = new PortfolioStore(portfolio);
    let compared = 0;
    for (const study of manifest.studies) {
      const dates = [...study.snapshots].sort();
      for (const [i, visit] of dates.entries()) {
        store.set('asOf', visit);
        for (const m of metrics) {
          const want = dates.slice(0, i + 1).map((date) => ({ date, rate: pooled(read, [study], m.MetricID, date).rate }));
          expect(store.studyTrend(study.StudyID, m.MetricID), `${study.StudyID} ${visit} ${m.ID}`).toEqual(want);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(500);
    expect(metrics.some((m) => m.Display === 'per_28d')).toBe(true);
  });

  it('32.09: a card\'s sparkline keeps each snapshot\'s place, leaves a gap where one has no value, shows a value with no neighbour as a dot, and its label counts every snapshot, those without a value and the last one\'s value as the header writes it (#32)', () => {
    const per28 = shown.find((m) => m.Display === 'per_28d');
    const draw = (rates) => {
      const el = { innerHTML: '', textContent: '' };
      sparkline(el, rates.map((rate, i) => ({ date: `2026-0${i + 1}-01`, rate })), { label: 'AE trend', format: (rate) => cardRate(per28, rate), gaps: true });
      return el;
    };
    const read = (el) => ({
      label: /aria-label="([^"]+)"/.exec(el.innerHTML)?.[1],
      segments: (/<path d="([^"]+)" class="spark-line"/.exec(el.innerHTML)?.[1] ?? '').split('M').filter(Boolean).map((seg) => [...seg.matchAll(/([\d.]+),([\d.]+)/g)].map((m) => Number(m[1]))),
      points: [...el.innerHTML.matchAll(/cx="([\d.]+)" cy="[\d.]+" r="[\d.]+" class="spark-point"/g)].map((m) => Number(m[1])),
      end: Number(/cx="([\d.]+)" cy="[\d.]+" r="[\d.]+" class="spark-dot"/.exec(el.innerHTML)?.[1] ?? Number.NaN),
    });
    // 96 px wide with 3 px padding: snapshot i of n sits at 3 + i × 90 / (n − 1).
    const at = (i, n) => Number((3 + (i * 90) / (n - 1)).toFixed(1));
    expect(read(draw([0.02, 0.05, null, 0.03]))).toEqual({
      label: 'AE trend: 4 snapshots, 1 without a value, latest 0.84 per 28 days',
      segments: [[at(0, 4), at(1, 4)]],
      points: [],
      end: at(3, 4),
    });
    expect(read(draw([0.02, null, 0.05, null, 0.04, 0.03]))).toMatchObject({ segments: [[at(4, 6), at(5, 6)]], points: [at(0, 6), at(2, 6)], end: at(5, 6) });
    expect(read(draw([0.02, 0.05, 0.04, null]))).toEqual({
      label: 'AE trend: 4 snapshots, 1 without a value, latest —',
      segments: [[at(0, 4), at(1, 4), at(2, 4)]],
      points: [],
      end: Number.NaN,
    });
    expect(read(draw([0.02, null, 0.05]))).toMatchObject({ segments: [], points: [at(0, 3)], end: at(2, 3) });
    expect(read(draw([0.02, 0.03, 0.05]))).toMatchObject({ label: 'AE trend: 3 snapshots, latest 1.40 per 28 days' });
    for (const rates of [[0.1], [null, 0.1, null], []]) expect(draw(rates).textContent, JSON.stringify(rates)).toBe('—');
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
