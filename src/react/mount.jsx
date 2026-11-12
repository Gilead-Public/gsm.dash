// @ts-check
import { createRoot } from 'react-dom/client';
import { PortfolioStore } from '../data/store.js';
import { openGlossary } from '../components/glossary.js';
import { initTheme } from '../app/theme.js';
import '../widgets/index.js';
import { readPortfolioDocument, readStudyDocument } from './document.js';
import { ErrorState } from './ErrorState.jsx';
import { StudyPage } from './StudyPage.jsx';

/** @param {import('./document.js').StudyDocument} doc */
function storeFor(doc) {
  const manifest = { generated: doc.generated, reportBase: doc.reportBase, metrics: doc.metrics, studies: [doc.study] };
  return new PortfolioStore({ manifest, snapshots: doc.snapshots, comparison: doc.comparison });
}

/** @param {import('./document.js').PortfolioDocument} doc */
function portfolioStoreFor(doc) {
  const manifest = { generated: doc.generated, reportBase: doc.reportBase, metrics: doc.metrics, studies: doc.studies };
  return new PortfolioStore({ manifest, snapshots: [], summary: doc.summary });
}

/**
 * Starts whichever page this is. Every page carries the same code, so the page names itself in `data-page`.
 * @param {HTMLElement | null} el
 */
export function mount(el) {
  if (!el) throw new Error('the report has no #app element');
  const page = document.body.dataset.page;
  if (page !== 'study' && page !== 'portfolio') throw new Error(`unknown report page "${page}"`);
  initTheme();
  const glossary = /** @type {HTMLButtonElement} */ (document.getElementById('glossaryBtn'));
  const meta = /** @type {HTMLElement} */ (document.getElementById('meta'));
  const text = document.getElementById('gsm-data')?.textContent;
  const root = createRoot(el);
  const result = page === 'study' ? readStudyDocument(text) : readPortfolioDocument(text);
  if (!result.ok) {
    glossary.hidden = true;
    return root.render(<ErrorState errors={result.errors} kind={page} />);
  }
  if (page === 'portfolio') {
    const store = portfolioStoreFor(/** @type {import('./document.js').PortfolioDocument} */ (result.doc));
    meta.textContent = `${store.studies.length} studies · ${store.metrics.length} metrics · exported ${store.generated}`;
    glossary.addEventListener('click', () => openGlossary(store));
    return root.render(<div className="layout" />);
  }
  const doc = /** @type {import('./document.js').StudyDocument} */ (result.doc);
  const { StudyID } = doc.study;
  const store = storeFor(doc);
  document.title = `${StudyID} · gsm.dash`;
  meta.textContent = `${store.metrics.length} metrics · exported ${store.generated}`;
  glossary.addEventListener('click', () => openGlossary(store));
  root.render(<StudyPage store={store} studyId={StudyID} />);
}
