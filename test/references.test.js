import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/widgets/index.js';
import { configProblems, noticeHtml, problemHtml, problemText, resolveView } from '../src/app/references.js';
import { currentTileView, tileViews, viewLabel } from '../src/app/tile-views.js';

const metric = (id, extra = {}) => ({ MetricID: `Analysis_${id}`, ID: id, Abbreviation: id.toUpperCase(), ...extra });

afterEach(() => vi.restoreAllMocks());

describe('references that fail visibly (#12)', () => {
  it('names the widget, the metric and the reason, and warns once however often the page renders', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = metric('kri0007');
    for (let i = 0; i < 3; i++) {
      expect(resolveView('distributon-bar', m)).toEqual({
        def: null,
        problem: { reference: 'Widget "distributon-bar" for KRI0007 (Analysis_kri0007)', reason: 'it is not a registered widget' },
      });
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[gsm.dash] Widget "distributon-bar" for KRI0007 (Analysis_kri0007): it is not a registered widget.');
    expect(resolveView('scalar-tile', m)).toMatchObject({ problem: null });
  });

  it('lists configuration that no tile can show: unknown metric IDs and view options for unknown widgets', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const catalog = [metric('kri0012'), metric('kri0007', { WidgetConfigs: { 'scalar-tyle': { flags: true }, 'scalar-tile': {} } })];
    const problems = configProblems(catalog, {
      breakdowns: { kri0012: {}, kri9999: {} },
      studies: { STUDY006: { configs: { 'flag-dsit': {}, 'scalar-tile': { flags: true } } } },
      pageWidgets: [{ widget: 'threshold-lst' }, { widget: 'threshold-list' }],
      detailTabs: [{ widget: 'viz-bar' }, { widget: 'viz-scater' }],
    });
    expect(problems.map(problemText)).toEqual([
      'Metric "kri9999" in the breakdown configuration: it is not in the metric catalog.',
      'Widget "scalar-tyle" in the view options of KRI0007 (Analysis_kri0007): it is not a registered widget.',
      'Widget "flag-dsit" in the view options of study STUDY006: it is not a registered widget.',
      'Widget "threshold-lst" in the study page layout: it is not a registered widget.',
      'Widget "viz-scater" in the drill-in tabs: it is not a registered widget.',
    ]);
    expect(configProblems([metric('kri0012')], { breakdowns: { kri0012: {} }, studies: {}, pageWidgets: [], detailTabs: [{ widget: 'viz-bar' }] })).toEqual([]);
  });

  it('the shipped configuration, page layout and drill-in tabs match the shipped catalog and widgets', async () => {
    const { generatePortfolio } = await import('../scripts/generate-example-data.mjs');
    expect(configProblems(generatePortfolio().manifest.metrics)).toEqual([]);
  });

  it('keeps an explicitly empty view name, which its tile then shows as a problem; only an omitted name means none', () => {
    const own = tileViews({ Widget: '' }, 'STUDY001');
    expect(own.at(-1)).toBe('');
    expect(currentTileView({ Widget: '' }, undefined, own)).toBe('');
    const extra = tileViews({ Widgets: [''] }, 'STUDY001');
    expect(currentTileView({ Widgets: [''] }, undefined, extra)).toBe('scalar-tile');
    expect(currentTileView({ Widgets: [''] }, '', extra)).toBe('');
    expect(tileViews({}, 'STUDY001')).not.toContain('');
    expect(currentTileView({}, undefined, tileViews({}, 'STUDY001'))).toBe('scalar-tile');
    expect([viewLabel('scalar-tile'), viewLabel(''), viewLabel('distributon-bar')]).toEqual(['Details', '""', '"distributon-bar"']);
  });

  it('escapes what it shows, and shows no notice when nothing is wrong', () => {
    const problem = { reference: 'Widget "<b>x</b>"', reason: 'it is not a registered widget' };
    expect(problemHtml(problem)).toContain('Widget &quot;&lt;b&gt;x&lt;/b&gt;&quot;');
    expect(noticeHtml([])).toBe('');
    expect(noticeHtml([problem])).toMatch(/^<div class="config-notice" role="status"><b>Configuration problems<\/b><ul><li>/);
  });
});
