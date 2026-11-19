// @ts-check
import { createRoot } from 'react-dom/client';
import { PortfolioStore } from '../data/store.js';
import '../widgets/index.js';
import { readPortfolioDocument, readStudyDocument } from './document.js';
import { ErrorState } from './ErrorState.jsx';
import { StudyPage } from './StudyPage.jsx';
import { PortfolioPage } from './PortfolioPage.jsx';

/** @param {import('./document.js').StudyDocument} doc */
function storeFor(doc) {
  const manifest = { generated: doc.generated, reportBase: doc.reportBase, metrics: doc.metrics, studies: [doc.study] };
  return new PortfolioStore({ manifest, snapshots: doc.snapshots });
}

/** @param {import('./document.js').PortfolioDocument} doc */
function portfolioStoreFor(doc) {
  const manifest = { generated: doc.generated, reportBase: doc.reportBase, metrics: doc.metrics, studies: doc.studies };
  return new PortfolioStore({ manifest, snapshots: [], summary: doc.summary, config: doc.config });
}

/**
 * The portfolio keeps its view in the URL's hash, rewritten in place on every change so the history is not filled.
 * @param {PortfolioStore} store
 */
function syncHash(store) {
  const write = () => {
    const params = store.programParams().toString();
    const url = `${location.href.split('#')[0]}${params ? `#${params}` : ''}`;
    if (url !== location.href) history.replaceState(null, '', url);
  };
  store.applyProgramParams(new URLSearchParams(location.hash.slice(1)));
  write();
  store.addEventListener('change', write);
}

/**
 * Starts whichever page this is. Every page carries the same code, so the page names itself in `data-page`.
 * @param {HTMLElement | null} el
 */
export function mount(el) {
  if (!el) throw new Error('the report has no #app element');
  const page = document.body.dataset.page;
  if (page !== 'study' && page !== 'portfolio') throw new Error(`unknown report page "${page}"`);
  const text = document.getElementById('gsm-data')?.textContent;
  const root = createRoot(el);
  const result = page === 'study' ? readStudyDocument(text) : readPortfolioDocument(text);
  if (!result.ok) return root.render(<ErrorState errors={result.errors} kind={page} />);
  if (page === 'portfolio') {
    const store = portfolioStoreFor(/** @type {import('./document.js').PortfolioDocument} */ (result.doc));
    /** @type {HTMLElement} */ (document.getElementById('meta')).textContent = `${store.studies.length} studies · ${store.metrics.length} metrics · exported ${store.generated}`;
    syncHash(store);
    return root.render(<PortfolioPage store={store} />);
  }
  const doc = /** @type {import('./document.js').StudyDocument} */ (result.doc);
  const { StudyID } = doc.study;
  const store = storeFor(doc);
  document.title = `${StudyID} · gsm.dash`;
  store.applyMetricParams(new URLSearchParams(location.hash.slice(1)));
  root.render(<StudyPage store={store} studyId={StudyID} back={`./portfolio.html${location.hash}`} />);
}
