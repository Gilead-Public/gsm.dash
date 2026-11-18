import { describe, it, expect } from 'vitest';
import { heatClasses } from '../src/app/portfolio-table.js';
import { GROUPS, GROUP_BINS, METRICS, STUDIES, STUDY_BINS, TOTAL, TOTAL_BINS } from './qual/heat.js';

const MEASURES = /** @type {const} */ (['num', 'den', 'rate']);
const metrics = METRICS.map((MetricID) => ({ MetricID }));

/**
 * A table row whose rollups are the fixed counts.
 * @param {'study' | 'bucket' | 'total'} kind
 * @param {import('./qual/heat.js').Counts} counts
 */
const row = (kind, counts, extra = {}) => ({
  kind,
  label: counts.label,
  ...extra,
  rollup: (/** @type {'M1' | 'M2'} */ id) => ({ Numerator: counts[id][0], Denominator: counts[id][1], Rate: counts[id][0] / counts[id][1] }),
});

const ungrouped = () => STUDIES.map((s) => row('study', s));
/** Groups A and C open, B closed: a study row is binned the same way whether its group is open or not. */
const grouped = () =>
  GROUPS.map((g) => row('bucket', g, { open: g.label !== 'B', children: STUDIES.filter((s) => s.group === g.label).map((s) => row('study', s)) }));

/**
 * Each row's bin for each metric.
 * @param {(r: any, m: any) => string} bin
 * @param {any[]} rows
 */
const bins = (bin, rows) => Object.fromEntries(metrics.map((m) => [m.MetricID, rows.map((r) => bin(r, m))]));

describe('heat bins against hand-worked bins (#23)', () => {
  for (const measure of MEASURES) {
    it(`23.04: ungrouped, under ${measure}, each study row takes its hand-worked bin among the study rows (#23)`, () => {
      const rows = ungrouped();
      expect(bins(heatClasses(measure, metrics, rows), rows)).toEqual(STUDY_BINS[measure]);
    });

    it(`23.04: grouped, under ${measure}, each group row takes its hand-worked bin among the group rows (#23)`, () => {
      const rows = grouped();
      expect(bins(heatClasses(measure, metrics, rows), rows)).toEqual(GROUP_BINS[measure]);
    });

    it(`23.04: grouped, under ${measure}, each study row under a group takes its hand-worked ungrouped bin (#23)`, () => {
      const rows = grouped();
      const bin = heatClasses(measure, metrics, rows);
      const children = rows.flatMap((g) => g.children);
      expect(children.map((c) => c.label)).toEqual(STUDIES.map((s) => s.label));
      expect(bins(bin, children)).toEqual(STUDY_BINS[measure]);
    });

    it(`23.04: under ${measure}, the Portfolio total takes its hand-worked bin, shaded under Rate only, among the top-level rows (#23)`, () => {
      const total = row('total', TOTAL);
      const flat = heatClasses(measure, metrics, ungrouped());
      const byGroup = heatClasses(measure, metrics, grouped());
      expect(Object.fromEntries(metrics.map((m) => [m.MetricID, flat(total, m)]))).toEqual(TOTAL_BINS.ungrouped[measure]);
      expect(Object.fromEntries(metrics.map((m) => [m.MetricID, byGroup(total, m)]))).toEqual(TOTAL_BINS.grouped[measure]);
    });
  }
});
