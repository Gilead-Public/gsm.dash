// The Auto / Light / Dark switch in the page header, shared by the app and the study reports. 'auto' follows the OS.
const THEME_KEY = 'gsm-dash-theme';

function applyTheme(pref) {
  if (pref === 'light' || pref === 'dark') document.documentElement.dataset.theme = pref;
  else delete document.documentElement.dataset.theme;
  for (const b of document.querySelectorAll('#themeSeg button')) {
    b.classList.toggle('on', b.dataset.themePref === pref);
  }
}

export function initTheme() {
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
