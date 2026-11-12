// @ts-check
import { createRoot } from 'react-dom/client';
import { PortfolioStore } from '../data/store.js';
import { openGlossary } from '../components/glossary.js';
import { initTheme } from '../app/theme.js';
import '../widgets/index.js';
import { readStudyDocument } from './document.js';
import { ErrorState } from './ErrorState.jsx';
import { StudyPage } from './StudyPage.jsx';

/** @param {import('./document.js').StudyDocument} doc */
function storeFor(doc) {
  const manifest = { generated: doc.generated, reportBase: doc.reportBase, metrics: doc.metrics, studies: [doc.study] };
  return new PortfolioStore({ manifest, snapshots: doc.snapshots, comparison: doc.comparison });
}

/** @param {HTMLElement | null} el */
export function mount(el) {
  if (!el) throw new Error('the report has no #app element');
  initTheme();
  const glossary = /** @type {HTMLButtonElement} */ (document.getElementById('glossaryBtn'));
  const result = readStudyDocument(document.getElementById('gsm-data')?.textContent);
  const root = createRoot(el);
  if (!result.ok) {
    glossary.hidden = true;
    return root.render(<ErrorState errors={result.errors} />);
  }
  const { StudyID } = result.doc.study;
  const store = storeFor(result.doc);
  document.title = `${StudyID} · gsm.dash`;
  /** @type {HTMLElement} */ (document.getElementById('meta')).textContent = `${store.metrics.length} metrics · exported ${store.generated}`;
  glossary.addEventListener('click', () => openGlossary(store));
  root.render(<StudyPage store={store} studyId={StudyID} />);
}
