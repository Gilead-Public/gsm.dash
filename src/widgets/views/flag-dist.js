import { registerWidget } from '../registry.js';
import { esc } from '../../util/format.js';
import { flagSeverity } from '../../scales/flags.js';

export const FLAG_LEVELS = [
  { key: 2, label: '+2' },
  { key: 1, label: '+1' },
  { key: 0, label: '0' },
  { key: -1, label: '−1' },
  { key: -2, label: '−2' },
  { key: null, label: 'NA' },
];

/** Site counts per flag value (null = non-evaluable) — pure and testable. */
export function flagCounts(siteRows) {
  const counts = new Map(FLAG_LEVELS.map((l) => [l.key, 0]));
  for (const r of siteRows) {
    const key = r.Flag == null ? null : Math.max(-2, Math.min(2, Math.round(r.Flag)));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// Horizontal bars, one per flag value, showing how many sites sit at each.
export function renderFlagDist(el, data) {
  const { metric, siteRows } = data;
  const counts = flagCounts(siteRows);
  const max = Math.max(1, ...counts.values());
  const rows = FLAG_LEVELS.map(
    (l) => `<div class="r"><span class="mono">${l.label}</span>
      <div class="btrack"><div class="b flag-${flagSeverity(l.key)}" style="width:${((counts.get(l.key) / max) * 100).toFixed(1)}%"></div></div>
      <span class="v">${counts.get(l.key)}</span></div>`
  ).join('');
  el.innerHTML = `
    <div class="sub-h">Sites by flag</div>
    <div class="hbar hbar-tight">${rows}</div>
    <div class="cmp">${siteRows.length} sites · flags as assigned by the pipeline</div>`;
}

registerWidget({
  name: 'flag-dist',
  label: 'Flag distribution',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderFlagDist,
});
