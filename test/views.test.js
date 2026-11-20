import { describe, it, expect } from 'vitest';
import { getWidget } from '../src/widgets/registry.js';
import '../src/widgets/index.js';

describe('the registered widgets', () => {
  it('the gsm.viz adapters are wide', () => {
    for (const name of ['viz-bar', 'viz-scatter', 'viz-timeseries']) {
      expect(getWidget(name).format, name).toBe('wide');
    }
  });

  it('35.05: no tile view is registered: Overview, Scatter (n vs d), Numerator by site, Details, Trend over time, the flag views or Report link (#35)', () => {
    for (const name of ['overview', 'scatter-mini', 'bar-numerator', 'scalar-tile', 'trend-mini', 'flag-dist', 'bar-outliers', 'link-out']) expect(getWidget(name), name).toBeNull();
  });
});
