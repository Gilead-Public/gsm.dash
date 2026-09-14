import { describe, it, expect } from 'vitest';
import { flagSeverity, shareBin, relativeBin, heatValue } from '../src/scales/flags.js';

describe('flag scale', () => {
  it('maps flags to severities with NA for null', () => {
    expect([2, -2, 1, -1, 0, null].map(flagSeverity)).toEqual(['red', 'red', 'amber', 'amber', 'green', 'na']);
  });
});

describe('heatmap bins', () => {
  it('shareBin uses absolute cut points and no shading at zero/null', () => {
    expect([null, 0, 0.05, 0.2, 0.4, 0.9].map(shareBin)).toEqual(['', '', 'hot1', 'hot2', 'hot3', 'hot4']);
  });

  it('relativeBin positions a value within the column range in four steps', () => {
    const d = { min: 10, max: 50 };
    expect([10, 20, 30, 40, 50].map((v) => relativeBin(v, d))).toEqual(['hot1', 'hot1', 'hot2', 'hot3', 'hot4']);
  });

  it('relativeBin shades nothing when the column has no spread or the value is null', () => {
    expect(relativeBin(5, { min: 5, max: 5 })).toBe('');
    expect(relativeBin(null, { min: 0, max: 1 })).toBe('');
  });

  it('heatValue reads the right quantity per measure, flag shares over all sites incl. NA', () => {
    const rollup = { Numerator: 30, Denominator: 100, Rate: 0.3, flags: { red: 2, amber: 3, green: 4, na: 1, total: 10 } };
    expect(heatValue('num', rollup)).toBe(30);
    expect(heatValue('den', rollup)).toBe(100);
    expect(heatValue('rate', rollup)).toBe(0.3);
    expect(heatValue('red', rollup)).toBeCloseTo(0.2);
    expect(heatValue('flagged', rollup)).toBeCloseTo(0.5); // red + amber over all sites incl. NA
    expect(heatValue('amber', rollup)).toBeNull(); // dropped measure
    expect(heatValue('none', rollup)).toBeNull();
  });
});
