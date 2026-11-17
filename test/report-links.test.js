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
    const problems = configProblems([metric('ae.html')], { breakdowns: {}, studies: {}, pageWidgets: [], detailTabs: [], kriGroups: [], reportBase: 'https://[bad', page });
    expect(problems.map(problemText)).toEqual(['Report link "ae.html" for AE (Analysis_kri0001): it can\'t be resolved against the report base "https://[bad".']);
  });

  it('13.03: a link whose scheme isn\'t http, https or file is reported rather than shown (#13)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const link of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<p>x</p>', 'vbscript:x']) {
      expect(reportLink(metric(link), null, page), link).toBeNull();
    }
    expect(reportLink(metric('file:///reports/ae.html'), null, page)).toBe('file:///reports/ae.html');
    expect(reportLink(metric('ae.html'), 'javascript:alert(1)//', page)).toBeNull();
    const problems = configProblems([metric('javascript:alert(1)')], { breakdowns: {}, studies: {}, pageWidgets: [], detailTabs: [], kriGroups: [], page });
    expect(problems.map(problemText)).toEqual(['Report link "javascript:alert(1)" for AE (Analysis_kri0001): its scheme "javascript:" isn\'t allowed; links must be http, https or file.']);
  });

  it('25.04: `{StudyID}` gives each study its own address, URL-encoded, and a link without it is the same for every study (#25)', () => {
    const base = 'https://reports.example.org/cod/';
    expect(reportLink(metric('studies/{StudyID}/ae.html'), base, page, 'S1')).toBe('https://reports.example.org/cod/studies/S1/ae.html');
    expect(reportLink(metric('studies/{StudyID}/ae.html'), base, page, 'S2')).toBe('https://reports.example.org/cod/studies/S2/ae.html');
    expect(reportLink(metric('{StudyID}/{StudyID}.html'), base, page, 'A B/C?#&')).toBe('https://reports.example.org/cod/A%20B%2FC%3F%23%26/A%20B%2FC%3F%23%26.html');
    expect(reportLink(metric('ae.html?study={StudyID}'), base, page, 'S1')).toBe('https://reports.example.org/cod/ae.html?study=S1');
    for (const id of ['S1', 'S2']) expect(reportLink(metric('ae.html'), base, page, id)).toBe('https://reports.example.org/cod/ae.html');
  });

  it('25.02: a link is checked with its `{StudyID}` filled, and a StudyID can\'t change its scheme (#25)', () => {
    const port = metric('https://reports.example.org:{StudyID}/ae.html');
    expect(reportLink(port, null, page, '8080')).toBe('https://reports.example.org:8080/ae.html');
    expect(reportLink(port, null, page, 'S1')).toBeNull();
    expect(reportLink(metric('javascript:alert("{StudyID}")'), null, page, 'S1')).toBeNull();
    expect(reportLink(metric('{StudyID}'), 'https://reports.example.org/', page, 'javascript:alert(1)')).toBe('https://reports.example.org/javascript%3Aalert(1)');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sources = { breakdowns: {}, studies: {}, pageWidgets: [], detailTabs: [], kriGroups: [], page };
    expect(configProblems([port], { ...sources, studyId: '8080' })).toEqual([]);
    expect(configProblems([port], { ...sources, studyId: 'S1' }).map(problemText)).toEqual(['Report link "https://reports.example.org:{StudyID}/ae.html" for AE (Analysis_kri0001): it can\'t be resolved against the report base "./".']);
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
