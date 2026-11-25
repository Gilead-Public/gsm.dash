import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/widgets/index.js';
import { configProblems, noticeHtml, problemHtml, problemText, resolveView, retiredInputs } from '../src/app/references.js';
import { studyCards } from '../src/app/study-cards.js';

const metric = (id, extra = {}) => ({ MetricID: `Analysis_${id}`, ID: id, Abbreviation: id.toUpperCase(), GroupLevel: 'Site', ...extra });
const NONE = { breakdowns: {}, cards: [], detailTabs: [], kriGroups: [] };

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
    expect(resolveView('kri-summary', m)).toMatchObject({ problem: null });
  });

  it('12.01: lists configuration that no card can show: unknown metric IDs, in the breakdowns and the card list, and options for unknown widgets (#12)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const catalog = [metric('kri0012'), metric('kri0007', { WidgetConfigs: { 'distributon-bar': {}, 'distribution-bar': {} } })];
    const problems = configProblems(catalog, {
      ...NONE,
      breakdowns: { kri0012: {}, kri9999: {} },
      cards: [{ metric: 'kri0012' }, { metric: 'kri0O12' }],
      detailTabs: [{ widget: 'viz-bar' }, { widget: 'viz-scater' }],
    });
    expect(problems.map(problemText)).toEqual([
      'Metric "kri9999" in the breakdown configuration: it is not in the metric catalog.',
      'Metric "kri0O12" in the study page\'s card list: it is not in the metric catalog.',
      'Widget "distributon-bar" in the view options of KRI0007 (Analysis_kri0007): it is not a registered widget.',
      'Widget "viz-scater" in the drill-in tabs: it is not a registered widget.',
    ]);
    expect(configProblems([metric('kri0012')], { ...NONE, breakdowns: { kri0012: {} }, cards: [{ metric: 'kri0012' }], detailTabs: [{ widget: 'viz-bar' }] })).toEqual([]);
  });

  it('12.01: lists the catalog inputs the tile pager used: extra views, and a widget or view options naming a retired view (#12)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const catalog = [
      metric('kri0015', { Widget: 'distribution-bar', Widgets: ['link-out', 'flag-dist'], WidgetConfigs: { 'link-out': { label: 'mortality report' } } }),
      metric('kri0006', { Widget: 'scalar-tile', WidgetConfigs: { 'flag-dist': {}, 'bar-outliers': {}, 'trend-mini': {}, 'distribution-bar': {} } }),
      metric('kri0001', { Widgets: [] }),
    ];
    const reason = 'tile views are retired, and each card shows one widget.';
    const expected = [
      `Views "link-out", "flag-dist" in the catalog entry of KRI0015 (Analysis_kri0015): ${reason}`,
      `View options for "link-out" in the catalog entry of KRI0015 (Analysis_kri0015): ${reason}`,
      `Widget "scalar-tile" in the catalog entry of KRI0006 (Analysis_kri0006): ${reason}`,
      `View options for "flag-dist" in the catalog entry of KRI0006 (Analysis_kri0006): ${reason}`,
      `View options for "bar-outliers" in the catalog entry of KRI0006 (Analysis_kri0006): ${reason}`,
      `View options for "trend-mini" in the catalog entry of KRI0006 (Analysis_kri0006): ${reason}`,
    ];
    expect(retiredInputs(catalog).map(problemText)).toEqual(expected);
    expect(configProblems(catalog, NONE).map(problemText)).toEqual(expected);
  });

  it('12.01: lists a catalog widget that is unknown or doesn\'t apply to its metric, whether or not the metric has a card (#12)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const catalog = [
      metric('kri0012', { Widget: 'distribution-bar' }),
      metric('ctq0002', { Widget: 'distributon-bar' }),
      metric('kri0007', { Widget: 'distribution-bar' }),
      metric('ctq0003', { Widget: '' }),
      metric('kri0006', { Widget: 'trend-mini' }),
    ];
    expect(configProblems(catalog, { ...NONE, breakdowns: { kri0012: {} } }).map(problemText)).toEqual([
      'Widget "distributon-bar" in the catalog entry of CTQ0002 (Analysis_ctq0002): it is not a registered widget.',
      'Widget "distribution-bar" in the catalog entry of KRI0007 (Analysis_kri0007): it has no breakdown configuration.',
      'Widget "" in the catalog entry of CTQ0003 (Analysis_ctq0003): it is not a registered widget.',
      'Widget "trend-mini" in the catalog entry of KRI0006 (Analysis_kri0006): tile views are retired, and each card shows one widget.',
    ]);
  });

  it('lists KRI group configuration no card can show: a group naming an unknown metric, and a metric naming an unknown group', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const catalog = [metric('kri0001'), metric('kri0010', { WidgetConfigs: { 'kri-summary': { group: 'dta' } } }), metric('kri0011', { WidgetConfigs: { 'kri-summary': { group: null } } })];
    const problems = configProblems(catalog, { ...NONE, kriGroups: [{ id: 'data', label: 'EDC and query rates', metrics: ['kri0001', 'kri0010x'] }] });
    expect(problems.map(problemText)).toEqual([
      'Metric "kri0010x" in the KRI group "EDC and query rates": it is not in the metric catalog.',
      'KRI group "dta" in the view options of KRI0010 (Analysis_kri0010): it is not a configured KRI group.',
    ]);
  });

  it('12.02: the shipped configuration, card list, page layout and drill-in tabs match the shipped catalog and widgets (#12)', async () => {
    const { generatePortfolio } = await import('../scripts/generate-example-data.mjs');
    const { metrics } = generatePortfolio().manifest;
    expect(configProblems(metrics, { page: 'https://example.org/dash/index.html' })).toEqual([]);
    const active = metrics.filter((m) => m.Active !== false);
    const cards = studyCards({ metrics: active, inactive: metrics.filter((m) => m.Active === false), visible: active });
    expect(cards.filter((c) => c.problem).map((c) => problemText(c.problem))).toEqual([]);
    expect(cards.every((c) => c.def)).toBe(true);
  });

  it('escapes what it shows, and shows no notice when nothing is wrong', () => {
    const problem = { reference: 'Widget "<b>x</b>"', reason: 'it is not a registered widget' };
    expect(problemHtml(problem)).toContain('Widget &quot;&lt;b&gt;x&lt;/b&gt;&quot;');
    expect(noticeHtml([])).toBe('');
    expect(noticeHtml([problem])).toMatch(/^<div class="config-notice" role="status"><b>Configuration problems<\/b><ul><li>/);
  });
});

describe('the study page\'s cards (#12, #32)', () => {
  const ie = metric('kri0014', { Abbreviation: 'IE', Metric: 'Eligibility', Widget: 'distribution-bar' });
  const ae = metric('kri0001', { Abbreviation: 'AE', Metric: 'AE Reporting Rate' });
  const sae = metric('kri0002', { Abbreviation: 'SAE', Metric: 'SAE Reporting Rate' });
  const resolve = (cards, { metrics = [ie, ae, sae], inactive = [], visible = metrics } = {}) => studyCards({ metrics, inactive, visible, cards });
  const reasons = (cards) => cards.map((c) => (c.problem ? problemText(c.problem) : null));

  it('12.01: a card whose metric is unknown or inactive, whose metric declares another widget, or which names an unknown widget or section shows why, and warns (#12)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cards = resolve(
      [
        { id: 'a', widget: 'distribution-bar', metric: 'kri0O14', title: 'Typo' },
        { id: 'b', widget: 'distribution-bar', metric: 'kri0013', title: 'Inactive' },
        { id: 'c', widget: 'kri-summary', metric: 'kri0014', title: 'Declared otherwise' },
        { id: 'd', widget: 'distribution-bar', metric: 'kri0001', title: 'No breakdown' },
        { id: 'e', widget: 'distributon-bar', metric: 'kri0014', title: 'Misspelt widget' },
        { id: 'f', widget: 'distribution-bar', metric: 'kri0014', title: 'Misspelt section', section: 'Denominator:eligibilty_status' },
        { id: 'g', widget: 'distribution-bar', metric: 'kri0014', title: 'Misspelt joint', joint: { rows: 'Denominator:eligibility_status', columns: ['Numerator:nope'] } },
        { id: 'h', widget: 'kri-summary', metric: 'kri0001' },
      ],
      { inactive: [metric('kri0013')] },
    );
    expect(reasons(cards)).toEqual([
      'Metric "kri0O14" for the card "Typo": it is not in the metric catalog.',
      'Metric "kri0013" for the card "Inactive": it is inactive.',
      'Widget "kri-summary" for the card "Declared otherwise": IE (Analysis_kri0014) is not a standard KRI.',
      'Widget "distribution-bar" for AE (Analysis_kri0001): it has no breakdown configuration.',
      'Widget "distributon-bar" for IE (Analysis_kri0014): it is not a registered widget.',
      'Breakdown "Denominator:eligibilty_status" for the card "Misspelt section": IE (Analysis_kri0014) has no such breakdown configured.',
      'Breakdown "Numerator:nope" for the card "Misspelt joint": IE (Analysis_kri0014) has no such breakdown configured.',
      null,
    ]);
    expect(cards.map((c) => Boolean(c.def))).toEqual([false, false, false, false, false, false, false, true]);
    expect(warn.mock.calls.map(([text]) => text)).toEqual(reasons(cards).filter(Boolean).map((t) => `[gsm.dash] ${t}`));
  });

  it('12.01: a breakdown card on a metric that declares no widget, or another one, shows why (#12)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const none = metric('kri0014', { Abbreviation: 'IE' });
    const other = metric('kri0014', { Abbreviation: 'IE', Widget: 'kri-summary' });
    const spec = { id: 'a', widget: 'distribution-bar', metric: 'kri0014', title: 'Eligibility Status', section: 'Denominator:eligibility_status' };
    expect(reasons(resolve([spec], { metrics: [none] }))).toEqual(['Widget "distribution-bar" for the card "Eligibility Status": IE (Analysis_kri0014) declares no widget.']);
    expect(reasons(resolve([spec], { metrics: [other] }))).toEqual(['Widget "distribution-bar" for the card "Eligibility Status": IE (Analysis_kri0014) declares the widget "kri-summary".']);
  });

  it('10.10: a valid card keeps its order, takes its title, and passes exactly its section or joint table to the widget, with the metric\'s options (#10)', () => {
    const deaths = metric('kri0015', { Abbreviation: 'DTH90', Metric: 'Early Deaths (90 days)', Widget: 'distribution-bar', WidgetConfig: { topN: 3 } });
    const joint = { rows: 'Numerator:death_window', columns: ['Numerator:window_eligibility', 'Numerator:window_treatment_related'] };
    const cards = resolve(
      [
        { id: 'one', widget: 'distribution-bar', metric: 'kri0014', title: 'Eligibility Status', section: 'Denominator:eligibility_status' },
        { id: 'two', widget: 'kri-summary', metric: 'kri0002' },
        { id: 'three', widget: 'distribution-bar', metric: 'kri0014', title: 'Eligibility I/E Criteria', section: 'Numerator:ietestcd_concat' },
        { id: 'four', widget: 'distribution-bar', metric: 'kri0015', title: 'Premature Death Summary', joint },
      ],
      { metrics: [ie, ae, sae, deaths] },
    );
    expect(cards.map((c) => [c.spec.id, c.title, c.def?.name, c.config])).toEqual([
      ['one', 'Eligibility Status', 'distribution-bar', { only: ['Denominator:eligibility_status'] }],
      ['two', 'SAE Reporting Rate', 'kri-summary', undefined],
      ['three', 'Eligibility I/E Criteria', 'distribution-bar', { only: ['Numerator:ietestcd_concat'] }],
      ['four', 'Premature Death Summary', 'distribution-bar', { topN: 3, joint }],
    ]);
  });

  it('12.01: a card whose metric isn\'t site-level shows why, rather than disappearing (#12)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const study = metric('ctq0001', { Abbreviation: 'SF', GroupLevel: 'Study', Widget: 'distribution-bar' });
    const cards = resolve([{ id: 'a', widget: 'distribution-bar', metric: 'ctq0001', title: 'Screening' }], { metrics: [study], visible: [] });
    expect(reasons(cards)).toEqual(['Metric "ctq0001" for the card "Screening": it is a Study-level metric, and the study page shows site-level metrics only.']);
  });

  it('32.03: a card whose metric the portfolio hides is left out, and a KRI configured as hidden by default is marked (#32)', () => {
    const hiddenSae = { ...sae, WidgetConfigs: { 'kri-summary': { hidden: true } } };
    const cards = resolve(
      [
        { id: 'ae', widget: 'kri-summary', metric: 'kri0001' },
        { id: 'sae', widget: 'kri-summary', metric: 'kri0002' },
        { id: 'ie', widget: 'distribution-bar', metric: 'kri0014', section: 'Denominator:eligibility_status' },
      ],
      { metrics: [ie, ae, hiddenSae], visible: [ae, hiddenSae] },
    );
    expect(cards.map((c) => [c.spec.id, c.hidden])).toEqual([
      ['ae', false],
      ['sae', true],
    ]);
  });
});
