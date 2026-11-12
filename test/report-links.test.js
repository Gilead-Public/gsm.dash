import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import '../src/widgets/index.js';
import { reportLink, reportLinkHtml } from '../src/app/report-links.js';
import { configProblems, problemText } from '../src/app/references.js';

const page = 'https://dash.example.org/cod-demo/study.html?x=1#top';
const metric = (ReportLink) => ({ MetricID: 'Analysis_kri0001', Abbreviation: 'AE', ReportLink });

afterEach(() => vi.restoreAllMocks());

describe('detailed-report links', () => {
  it('13.02: a relative path resolves against the configured base, which resolves against the page (#13)', () => {
    const base = 'https://reports.example.org/cod/study-reports/';
    expect(reportLink(metric('ae/index.html'), base, page)).toBe('https://reports.example.org/cod/study-reports/ae/index.html');
    expect(reportLink(metric('../shared/ae.html'), base, page)).toBe('https://reports.example.org/cod/shared/ae.html');
    expect(reportLink(metric('ae.html'), 'reports/', page)).toBe('https://dash.example.org/cod-demo/reports/ae.html');
    expect(reportLink(metric('ae.html'), '../reports/', page)).toBe('https://dash.example.org/reports/ae.html');
    expect(reportLink(metric('ae.html'), null, page)).toBe('https://dash.example.org/cod-demo/ae.html');
    expect(reportLink(metric('https://other.example.org/ae'), base, page)).toBe('https://other.example.org/ae');
  });

  it('13.03: a metric without a configured link has none, and an unresolvable link is reported rather than shown (#13)', () => {
    expect(reportLink(metric(undefined), 'https://reports.example.org/', page)).toBeNull();
    expect(reportLinkHtml(null)).toBe('');
    expect(reportLink(metric('ae.html'), 'https://[bad', page)).toBeNull();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const problems = configProblems([metric('ae.html')], { breakdowns: {}, studies: {}, pageWidgets: [], detailTabs: [], reportBase: 'https://[bad', page });
    expect(problems.map(problemText)).toEqual(['Report link "ae.html" for AE (Analysis_kri0001): it can\'t be resolved against the report base "https://[bad".']);
  });

  it('the manifest and the study report accept a report base and per-metric links, and refuse other types', () => {
    const schema = (name) => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    ajv.addSchema(schema('study-snapshot'));
    const portfolio = ajv.compile(schema('portfolio'));
    const manifest = {
      schemaVersion: '1.0.0',
      generated: '2026-08-31T12:00:00Z',
      reportBase: 'https://reports.example.org/cod/',
      studies: [{ StudyID: 'S1', params: {}, snapshots: ['2026-01-31'], files: { '2026-01-31': 'studies/S1/2026-01-31.json' } }],
      metrics: [{ MetricID: 'Analysis_kri0001', GroupLevel: 'Site', Abbreviation: 'AE', Metric: 'AE rate', ReportLink: 'ae.html' }],
    };
    expect(portfolio(manifest), JSON.stringify(portfolio.errors)).toBe(true);
    expect(portfolio({ ...manifest, reportBase: 3 })).toBe(false);
    expect(portfolio({ ...manifest, metrics: [{ ...manifest.metrics[0], ReportLink: '' }] })).toBe(false);
  });
});
