import { describe, it, expect, beforeEach } from 'vitest';
import { PortfolioStore } from '../src/data/store.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

// Unified program views (design iteration 2): Overview and Details are two
// zoom levels of one table, derived from the category folds; Distribution is
// a separate view. All three share the store's highlight and filters.

let store;
const portfolio = generatePortfolio();
beforeEach(() => {
  store = new PortfolioStore(portfolio);
});
const cats = () => store.metricCategories().map((g) => g.category);

describe('table zoom', () => {
  it('lands on Overview with every category folded', () => {
    expect(store.state.programView).toBe('table');
    expect(store.tableZoom()).toBe('overview');
  });

  it('derives details / mixed from the folds', () => {
    store.setProgramView('details');
    expect(store.tableZoom()).toBe('details');
    store.toggleGroup(cats()[0]);
    expect(store.tableZoom()).toBe('mixed');
    store.setProgramView('overview');
    expect(store.tableZoom()).toBe('overview');
  });

  it('keeps the table folds when switching to Distribution and back', () => {
    store.toggleGroup(cats()[1]);
    store.setProgramView('distribution');
    expect(store.state.programView).toBe('distribution');
    expect(store.tableZoom()).toBe('mixed');
  });
});

describe('highlight study', () => {
  it('toggles: selecting the highlighted study again clears it', () => {
    const id = store.studies[2].StudyID;
    store.highlight(id);
    expect(store.state.highlightStudy).toBe(id);
    store.highlight(id);
    expect(store.state.highlightStudy).toBeNull();
    store.highlight(null);
    expect(store.state.highlightStudy).toBeNull();
  });
});

describe('URL params', () => {
  it('round-trips view, open bands, highlight and distribution folds', () => {
    const [a, b] = cats();
    store.toggleGroup(a);
    store.highlight(store.studies[0].StudyID);
    store.toggleDistGroup(b);
    store.setProgramView('distribution');
    const params = store.programParams();
    expect(params.get('view')).toBe('distribution');
    expect(params.get('open')).toBe(a);

    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(params.toString()));
    expect(other.state.programView).toBe('distribution');
    expect(other.tableZoom()).toBe('mixed');
    expect(other.state.collapsedGroups.has(a)).toBe(false);
    expect(other.state.highlightStudy).toBe(store.studies[0].StudyID);
    expect([...other.state.distCollapsed]).toEqual([b]);
  });

  it('accepts a hand-written ?view=details and ignores unknown ids', () => {
    store.applyProgramParams(new URLSearchParams('view=details&study=NOPE&dfold=Nope'));
    expect(store.tableZoom()).toBe('details');
    expect(store.state.highlightStudy).toBeNull();
    expect(store.state.distCollapsed.size).toBe(0);
  });

  it('writes only the view for the default Overview', () => {
    expect(store.programParams().toString()).toBe('view=overview');
  });
});
