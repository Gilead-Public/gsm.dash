import { describe, expect, it } from 'vitest';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';
import { poolResults } from '../src/data/rollup.js';
import { studyCards } from '../src/app/study-cards.js';
import { kriSummary } from '../src/widgets/kri-summary.js';
import { pooled, shownMetrics } from './qual/pooling.js';

const { manifest, snapshots } = generatePortfolio();
const files = new Map(
  manifest.studies.flatMap((s) => Object.entries(s.files).map(([date, path]) => [path, snapshots.find((x) => x.StudyID === s.StudyID && x.SnapshotDate === date)])),
);
const read = (path) => files.get(path);
const shown = shownMetrics(manifest.metrics);
const ids = (list) => list.map((m) => m.ID);
const withConfig = (configs) => shown.map((m) => (configs[m.ID] ? { ...m, WidgetConfigs: { ...m.WidgetConfigs, 'kri-summary': configs[m.ID] } } : m));
const KRIS = ['kri0001', 'kri0002', 'kri0005', 'kri0003', 'kri0004', 'kri0008', 'kri0009', 'kri0010', 'kri0011'];
const siteRowsAt = (snapshot, metric) => snapshot.results.filter((r) => r.GroupLevel === 'Site' && r.MetricID === metric.MetricID);

describe('the study page\'s cards in order (#32)', () => {
  const inactive = manifest.metrics.filter((m) => m.Active === false);
  const cards = (metrics) => studyCards({ metrics, inactive, visible: metrics });

  it('32.03: by default the cards follow tracker order, the breakdowns then the nine standard KRIs, each once (#32)', () => {
    const all = cards(shown);
    expect(all.map((c) => c.spec.id)).toEqual([
      'eligibility-status', 'ie-criteria', 'premature-deaths', 'ip-status', 'treatment-disposition',
      'treatment-discontinuation-reasons', 'study-disposition', 'screening-disposition', 'screen-failure-reasons',
      'kri0004', 'kri0003', 'kri0002', 'kri0001', 'kri0005', 'kri0008', 'kri0009', 'kri0010', 'kri0011',
    ]);
    expect(all.filter((c) => c.kri).map((c) => c.metric.ID).sort()).toEqual([...KRIS].sort());
  });

  it('32.04: nothing is hidden by default, and only the KRIs configured as hidden are marked (#32)', () => {
    expect(cards(shown).some((c) => c.hidden)).toBe(false);
    const marked = cards(withConfig({ kri0002: { hidden: true }, kri0009: { hidden: true } })).filter((c) => c.hidden);
    expect(marked.map((c) => c.metric.ID)).toEqual(['kri0002', 'kri0009']);
  });
});

describe('the compact KRI summary', () => {
  const kris = KRIS.map((id) => manifest.metrics.find((m) => m.ID === id));
  const expected = (metric, p) => {
    const per28 = metric.Display === 'per_28d';
    const total = p.flags.red + p.flags.amber + p.flags.green + p.flags.na;
    return {
      rate: p.rate === null ? '—' : per28 ? (p.rate * 28).toFixed(2) : `${(p.rate * 100).toFixed(1)}%`,
      unit: per28 ? 'per 28 days' : null,
      n: p.numerator.toLocaleString('en-US'),
      N: per28 ? (p.denominator / 28).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : p.denominator.toLocaleString('en-US'),
      flags: [['red', 'Red'], ['amber', 'Amber'], ['green', 'Green'], ['na', 'No flag']].map(([key, label]) => ({
        key, label, count: p.flags[key], percent: total ? `${((p.flags[key] / total) * 100).toFixed(1)}%` : '—',
      })),
    };
  };

  it('32.01: the rate, n / N and site counts and percentages per flag equal an independent pooling of the site rows, for every study and KRI at every visit (#32)', () => {
    let compared = 0;
    for (const study of manifest.studies) {
      for (const date of study.snapshots) {
        const snapshot = read(study.files[date]);
        for (const metric of kris) {
          const rows = siteRowsAt(snapshot, metric);
          if (!rows.length) continue;
          const { Numerator, Denominator, Rate } = poolResults(rows);
          const summary = kriSummary(metric, { Numerator, Denominator, Metric: Rate }, rows);
          expect(summary, `${study.StudyID} ${date} ${metric.ID}`).toEqual(expected(metric, pooled(read, [study], metric.MetricID, date)));
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('32.01: sites without a flag count in every flag percentage (#32)', () => {
    const metric = kris[0];
    const s = kriSummary(metric, null, [{ Flag: 2 }, { Flag: -1 }, { Flag: 0 }, { Flag: null }]);
    expect(s.flags.map((f) => [f.key, f.count, f.percent])).toEqual([['red', 1, '25.0%'], ['amber', 1, '25.0%'], ['green', 1, '25.0%'], ['na', 1, '25.0%']]);
    expect([s.rate, s.n, s.N]).toEqual(['—', '—', '—']);
  });

  it('32.02: a rate per 28 days is n ÷ exposure days × 28 and its N is exposure days ÷ 28, both from the unrounded sums, with the configured unit label (#32)', () => {
    const metric = kris.find((m) => m.Display === 'per_28d');
    const s = kriSummary(metric, { Numerator: 1, Denominator: 29, Metric: 1 / 29 }, []);
    expect([s.rate, s.N, s.unit]).toEqual(['0.97', '1.0', 'per 28 days']);
    const relabelled = { ...metric, WidgetConfigs: { 'kri-summary': { unit: 'per 4 weeks' } } };
    expect(kriSummary(relabelled, { Numerator: 1, Denominator: 29, Metric: 1 / 29 }, []).unit).toBe('per 4 weeks');
    const pct = kris.find((m) => m.Display !== 'per_28d');
    expect(kriSummary(pct, { Numerator: 1, Denominator: 29, Metric: 1 / 29 }, [])).toMatchObject({ rate: '3.4%', N: '29', unit: null });
  });
});

describe('pooling site rows into the study value', () => {
  it('32.07: poolResults equals an independent pooling of every study\'s site rows, for every metric at every visit (#32)', () => {
    let compared = 0;
    for (const study of manifest.studies) {
      for (const date of study.snapshots) {
        const snapshot = read(study.files[date]);
        for (const metric of shown) {
          const rows = siteRowsAt(snapshot, metric);
          const p = pooled(read, [study], metric.MetricID, date);
          const r = poolResults(rows);
          expect([r.Numerator, r.Denominator, r.Rate], `${study.StudyID} ${date} ${metric.ID}`).toEqual([p.numerator, p.denominator, p.rate]);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });
});
