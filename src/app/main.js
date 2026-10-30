import { loadPortfolio } from '../data/load.js';
import { PortfolioStore } from '../data/store.js';
import '../components/gsm-sidebar.js';
import '../components/gsm-portfolio-table.js';
import '../components/gsm-portfolio-dist.js';
import '../components/gsm-view-switch.js';
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
  const study = hash.match(/^#\/study\/([^/?]+)$/);
  if (study) return { page: 'study', studyId: decodeURIComponent(study[1]) };
  const q = hash.indexOf('?');
  return { page: 'program', params: q < 0 ? null : new URLSearchParams(hash.slice(q + 1)) };
}

/** Keep the program view in the URL without adding history entries or firing hashchange. */
function writeProgramHash(store) {
  if (route().page !== 'program') return;
  const hash = `#/program?${store.programParams()}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function renderPage(root, store) {
  const { page, studyId, params } = route();
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
  const views = document.createElement('gsm-view-switch');
  const table = document.createElement('gsm-portfolio-table');
  const dist = document.createElement('gsm-portfolio-dist');
  // A bare #/program (e.g. the study page's back link) keeps the current view.
  if (params) store.applyProgramParams(params);
  for (const el of [sidebar, views, table, dist]) el.store = store;
  content.append(views, table, dist);
  layout.append(sidebar, content);
  root.append(layout);
  showProgramView(store);
  writeProgramHash(store);
}

function showProgramView(store) {
  const dist = store.state.programView === 'distribution';
  const table = document.querySelector('#app gsm-portfolio-table');
  if (table) table.hidden = dist;
  const plot = document.querySelector('#app gsm-portfolio-dist');
  if (plot) plot.hidden = !dist;
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
    store.addEventListener('change', () => {
      showProgramView(store);
      writeProgramHash(store);
    });
    renderPage(root, store);
    initAnnotations();
  } catch (err) {
    root.innerHTML = `<p class="muted">Failed to load portfolio data: ${err.message}. Run <code>npm run generate-data</code>.</p>`;
    throw err;
  }
}

main();
