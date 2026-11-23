// @ts-check
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { applyAdmin, readAdmin, writeAdmin } from '../app/admin-settings.js';
import { PortfolioStore, currentParams } from '../data/store.js';
import '../widgets/index.js';
import { readPortfolioDocument, readStudyDocument } from './document.js';
import { ErrorState } from './ErrorState.jsx';
import { StudyPage } from './StudyPage.jsx';
import { PortfolioPage } from './PortfolioPage.jsx';
import { AdminMenu } from './AdminPanel.jsx';

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
    applyAdmin(store.state.admin);
  };
  store.applyProgramParams(new URLSearchParams(location.hash.slice(1)));
  write();
  store.addEventListener('change', write);
}

const hashParams = () => new URLSearchParams(location.hash.slice(1));
/** @param {URLSearchParams} params */
const writeHash = (params) => {
  const hash = params.toString();
  history.replaceState(null, '', `${location.href.split('#')[0]}${hash ? `#${hash}` : ''}`);
};

/**
 * A study report and its Admin menu (#46). An Admin change rewrites only the Admin settings in the address, keeping the
 * portfolio's view it arrived with, so the back link, built from the current address, carries both.
 * @param {{ store: PortfolioStore, studyId: string }} props
 */
function StudyReport({ store, studyId }) {
  const [admin, setAdmin] = useState(() => readAdmin(hashParams()));
  const change = (/** @type {string} */ key, /** @type {string} */ value) => {
    const next = { ...admin, [key]: value };
    writeHash(writeAdmin(hashParams(), next));
    applyAdmin(next);
    setAdmin(next);
  };
  const host = document.getElementById('header-controls');
  return (
    <>
      {host && createPortal(<AdminMenu admin={admin} onChange={change} />, host)}
      <StudyPage store={store} studyId={studyId} back={`./portfolio.html${location.hash}`} />
    </>
  );
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
  applyAdmin(readAdmin(hashParams()));
  const result = page === 'study' ? readStudyDocument(text) : readPortfolioDocument(text);
  if (!result.ok) return root.render(<ErrorState errors={result.errors} kind={page} />);
  const title = /** @type {{ title?: string }} */ (result.doc).title ?? 'gsm.dash';
  const heading = document.querySelector('header.app h1');
  if (heading) heading.textContent = title;
  if (page === 'portfolio') {
    const store = portfolioStoreFor(/** @type {import('./document.js').PortfolioDocument} */ (result.doc));
    document.title = title;
    syncHash(store);
    return root.render(<PortfolioPage store={store} />);
  }
  const doc = /** @type {import('./document.js').StudyDocument} */ (result.doc);
  const { StudyID } = doc.study;
  const store = storeFor(doc);
  document.title = `${StudyID} · ${title}`;
  // The portfolio's view rides on in the address and the back link, in its current form (#46, #47).
  const current = currentParams(hashParams());
  if (current.toString() !== hashParams().toString()) writeHash(current);
  store.applyMetricParams(current);
  root.render(<StudyReport store={store} studyId={StudyID} />);
}
