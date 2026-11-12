import { createRoot } from 'react-dom/client';
import { readStudyDocument } from './document.js';
import { ErrorState } from './ErrorState.jsx';
import { StudyPage } from './StudyPage.jsx';

/** @param {HTMLElement | null} el */
export function mount(el) {
  if (!el) throw new Error('the report has no #app element');
  const result = readStudyDocument(document.getElementById('gsm-data')?.textContent);
  createRoot(el).render(result.ok ? <StudyPage doc={result.doc} /> : <ErrorState errors={result.errors} />);
}
