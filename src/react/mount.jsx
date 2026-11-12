// @ts-check
import { createRoot } from 'react-dom/client';
import { PortfolioStore } from '../data/store.js';
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
  const result = readStudyDocument(document.getElementById('gsm-data')?.textContent);
  const root = createRoot(el);
  if (!result.ok) return root.render(<ErrorState errors={result.errors} />);
  const { StudyID } = result.doc.study;
  document.title = `${StudyID} · gsm.dash`;
  root.render(<StudyPage store={storeFor(result.doc)} studyId={StudyID} />);
}
