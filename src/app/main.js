import { loadPortfolio } from '../data/load.js';
import { PortfolioStore } from '../data/store.js';
import '../components/gsm-sidebar.js';
import '../components/gsm-portfolio-table.js';
import '../components/gsm-study-page.js';
import { openGlossary } from '../components/glossary.js';
import { initAnnotations } from './annotations.js';

const THEME_KEY = 'gsm-dash-theme';

function applyTheme(pref) {
  if (pref === 'light' || pref === 'dark') document.documentElement.dataset.theme = pref;
  else delete document.documentElement.dataset.theme; // 'auto' follows the OS
  for (const b of document.querySelectorAll('#themeSeg button')) {
    b.classList.toggle('on', b.dataset.themePref === pref);
  }
}

function initTheme() {
  let pref = 'auto';
  try { pref = localStorage.getItem(THEME_KEY) ?? 'auto'; } catch { /* storage unavailable */ }
  applyTheme(pref);
  document.getElementById('themeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-theme-pref]');
    if (!b) return;
    applyTheme(b.dataset.themePref);
    try { localStorage.setItem(THEME_KEY, b.dataset.themePref); } catch { /* storage unavailable */ }
  });
}

function route() {
  const hash = location.hash || '#/program';
  const study = hash.match(/^#\/study\/([^/]+)$/);
  return study ? { page: 'study', studyId: decodeURIComponent(study[1]) } : { page: 'program' };
}

function renderPage(root, store) {
  const { page, studyId } = route();
  document.getElementById('page-tag').textContent = page === 'study' ? 'Study view' : 'Program overview';
  root.innerHTML = '';
  if (page === 'study') {
    const studyPage = document.createElement('gsm-study-page');
    studyPage.setAttribute('study-id', studyId);
    studyPage.store = store;
    root.append(studyPage);
    return;
  }
  const layout = document.createElement('div');
  layout.className = 'layout';
  const sidebar = document.createElement('gsm-sidebar');
  const content = document.createElement('div');
  content.className = 'content';
  const table = document.createElement('gsm-portfolio-table');
  sidebar.store = store;
  table.store = store;
  content.append(table);
  layout.append(sidebar, content);
  root.append(layout);
}

async function main() {
  const root = document.getElementById('app');
  initTheme();
  try {
    const store = new PortfolioStore(await loadPortfolio());
    document.getElementById('meta').textContent =
      `${store.studies.length} studies · ${store.metrics.length} metrics · exported ${store.generated}`;
    // studySelected extends the gsm.viz event vocabulary; the shell answers it with navigation.
    document.addEventListener('studySelected', (e) => {
      location.hash = `#/study/${encodeURIComponent(e.detail.StudyID)}`;
    });
    document.getElementById('glossaryBtn').addEventListener('click', () => openGlossary(store));
    window.addEventListener('hashchange', () => renderPage(root, store));
    renderPage(root, store);
    initAnnotations();
  } catch (err) {
    root.innerHTML = `<p class="muted">Failed to load portfolio data: ${err.message}. Run <code>npm run generate-data</code>.</p>`;
    throw err;
  }
}

main();
