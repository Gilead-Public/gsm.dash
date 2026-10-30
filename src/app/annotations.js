// Design-review annotations: numbered pins over the live prototype that tie
// each change to its proposal (P1–P7) or open question (Q1–Q10) in the
// portfolio design doc. Purely presentational: pins are positioned over
// whatever the components rendered, so they never touch the store. Toggle with
// the header button; the choice is remembered.
import { esc } from '../util/format.js';

const KEY = 'gsm-dash-annotations';
const REQ = (n) => `<a href="https://github.com/Gilead-BioStats/gsm.roadmap/issues/${n}" target="_blank" rel="noopener">gsm.roadmap#${n}</a>`;

/**
 * `targets`: selectors tried in order; the first that matches places the pin
 * (an array of arrays places one pin per group, e.g. P6's two surfaces).
 */
export const ANNOTATIONS = [
  {
    id: 'P1', page: 'program', kind: 'proposal', at: 'right', targets: [['[data-anno="showing"]']],
    title: 'The glossary becomes metric metadata',
    body: `Metric names, numerator / denominator text, category, status and display rule now come from the CTQ tracker. They travel as optional manifest metric fields: <code>Display</code>, <code>Population</code>, <code>Status</code>, <code>Category</code>, <code>RequirementID</code>. The line above now counts metrics by status and names the cell mode.`,
    source: 'Tracker columns: Metric, Numerator, Denominator, COD Display, Status.',
  },
  {
    id: 'P2', page: 'program', kind: 'proposal', targets: [['th[data-abbr="AE"]', 'th[data-abbr="PD"]']],
    title: 'Metric-specific cell formats',
    body: `Exposure metrics (AE, SAE, PD, IPD) read as <b>events per 28 days</b> of exposure. Participant metrics read as <b>n (%)</b>, and data-quality metrics as <b>%</b>. The 28-day factor is display only: flags, heatmap bins and sort order are unchanged. Switch back with <i>Cell display → Custom</i> in the sidebar.`,
    source: 'Tracker "COD Display": count (%) · 28-day "month" rate.',
  },
  {
    id: 'P3', page: 'program', kind: 'proposal', at: 'in-right', targets: [['th[data-band]']],
    title: 'Grouped columns with unit headers',
    body: `Five category bands: Disposition · Early events · Eligibility &amp; integrity · Safety &amp; deviations · Data quality. Each metric header states its unit. Click <b>▾</b> on a band to fold it into one summary column (dots = metrics with many flagged sites). The study page uses the same categories for its tile rows.`,
    source: 'Category grouping is this proposal’s own (Q6).',
  },
  {
    id: 'P4', page: 'program', kind: 'proposal', targets: [['[data-anno="population"]']],
    title: 'Screened · Enrolled · Dosed',
    body: `The glossary divides by three populations, so each one gets a column. Every n (%) can be traced to its denominator. Enrolled is today’s <code>ParticipantCount</code>. <b>Screened</b> and <b>Dosed</b> need two new optional Reporting_Groups params (<code>ScreenedCount</code>, <code>DosedCount</code>), which is a contract change.`,
    source: 'Tracker denominators: All enrolled · All dosed · Total screened.',
  },
  {
    id: 'P5', page: 'program', kind: 'proposal', targets: [['th.planned']],
    title: 'Released / New / Planned',
    body: `Each metric carries its tracker status. <span class="pill new">New</span> and <span class="pill planned">Planned</span> pills mark metrics in development or still to come. Planned headers are hatched and their values are <b>simulated</b>. The proposal hides Planned metrics in the exec view by default. They are on here for the design review. Use the Status chips in the sidebar.`,
    source: 'Open question Q8: hide Planned, or show as "coming soon"?',
  },
  {
    id: 'P6', page: 'program', kind: 'proposal', at: 'out', targets: [['th[data-abbr="SDSC"] .info', 'th[data-abbr] .info'], ['#glossaryBtn']],
    title: 'Glossary tooltips and panel',
    body: `Hover any ⓘ for the glossary entry: definition, numerator, denominator, display rule, flagging, owning Requirement. <b>Metric glossary</b> in the header opens the whole tracker as a searchable page, with links to each Requirement (e.g. ${REQ(61)}).`,
    source: 'Definitions are empty in the tracker (Q2).',
  },
  {
    id: 'P7', page: 'program', kind: 'proposal', at: 'in-right', targets: [['[data-anno="cellmode"]'], ['[data-anno="status"]']],
    title: 'Sidebar reorganised around the glossary',
    body: `<b>Cell display</b>: <i>As defined</i> (glossary rule plus optional flag extras) or <i>Custom</i> (the previous numerator / denominator / rate stack). The <b>Status</b> filter and a metric list grouped by category, with per-group all/none and status pills.`,
  },
  {
    id: 'Q1', page: 'program', kind: 'question', targets: [['th[data-abbr="SF"]']],
    title: 'Screen failure appears twice',
    body: `The Released "Screen Failure Rate" divides by total screened. The Planned "Screen Failure" divides by all enrolled. Screen-failed participants are never enrolled, so the prototype keeps one column, ÷ screened. Is that right?`,
  },
  {
    id: 'Q3', page: 'program', kind: 'question', targets: [['th[data-abbr="SAE"]']],
    title: '“/ 28 d” or “per month”?',
    body: `The 28-day rescale is display only (flags are computed per day upstream). Which label do users prefer?`,
  },
  {
    id: 'Q4', page: 'program', kind: 'question', targets: [['th[data-band="Data quality"]']],
    title: 'Data quality display',
    body: `The tracker gives no COD Display for the data-quality metrics. They stay as %. Should they move to count (%)?`,
  },
  {
    id: 'Q5', page: 'program', kind: 'question', targets: [['th[data-abbr="TDSC"]']],
    title: 'TDSC denominator is changing',
    body: `Marked "changed-in-dev" with denominator <b>All dosed</b> (${REQ(90)}). The prototype already divides by dosed. When does the released gsm.kri metric change?`,
  },
  {
    id: 'Q9', page: 'program', kind: 'question', targets: [['th[data-abbr="DTH30"]']],
    title: 'Early deaths: 30 and 90 days',
    body: `Two adjacent columns as shown, or one column with a 30 / 90 switch? (${REQ(121)})`,
  },
  {
    id: 'Q10', page: 'program', kind: 'question', targets: [['th[data-abbr="STRAT"]']],
    title: 'Site-level availability',
    body: `The portfolio rolls up site-level rows. Will the Planned workflows (stratification, PFS censoring, IP non-starters) emit site-level results, or only study or participant level?`,
  },
  {
    id: 'S1', page: 'study', kind: 'proposal', at: 'right', targets: [['.dd-row .rowlab']],
    title: 'Tile rows use the glossary categories',
    body: `The study page groups tiles by the same five categories as the program table’s bands, so both pages present metrics in the same order. The metric-specific widget redesign follows the study-page design notes.`,
    source: 'Q6: validate category names with users.',
  },
  {
    id: 'S2', page: 'study', kind: 'proposal', at: 'left', targets: [['.tile .big', '.tile']],
    title: 'Tiles follow the display rule',
    body: `Tile headline numbers use the same rule as the program cells: n (%), events per 28 days, or %. Known gap: the drill-in gsm.viz charts still plot the per-day rate for exposure metrics.`,
  },
];

let enabled = true;
let layer;
let legend;
let card;
let openId = null;
let frame = 0;

const page = () => (/^#\/study\//.test(location.hash) ? 'study' : 'program');
const current = () => ANNOTATIONS.filter((a) => a.page === page());

function findTarget(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(`#app ${sel}, header.app ${sel}`);
    if (el) return el;
  }
  return null;
}

/** Is the point visible, i.e. not scrolled out of the table or under its sticky first column? */
function visibleAt(el, x, y) {
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const wrap = el.closest('.tblwrap');
  if (!wrap) return true;
  const w = wrap.getBoundingClientRect();
  const sticky = wrap.querySelector('th.grp')?.getBoundingClientRect().right ?? w.left;
  return x >= (el.closest('.grp') ? w.left : sticky) && x <= w.right;
}

/**
 * Where a pin sits on its target: on a column header's top edge, inside a
 * header's top-left corner, inside a
 * block's top-right, just past the end of a line of text, left of a number,
 * or (small controls) over the top-right corner.
 */
function anchor(el, r, at) {
  switch (at) {
    case 'in-left':
      return [r.left + 13, r.top + 10];
    case 'edge-left':
      return [r.left + 13, r.top];
    case 'in-right':
      return [r.right - 14, r.top + 10];
    case 'left':
      return [r.left - 12, r.top + r.height / 2];
    case 'right': {
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      return [Math.min(t.right, r.right) + 16, t.top + t.height / 2];
    }
    default:
      return [r.right - 2, r.top - 3];
  }
}

function place() {
  frame = 0;
  if (!layer) return;
  layer.innerHTML = '';
  document.querySelectorAll('.anno-target').forEach((el) => el.classList.remove('anno-target'));
  if (!enabled) return;
  for (const a of current()) {
    for (const group of a.targets) {
      const el = findTarget(group);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const [x, y] = anchor(el, r, a.at ?? (el.tagName === 'TH' ? 'edge-left' : 'out'));
      if (!visibleAt(el, x, r.top + r.height / 2)) continue;
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = `anno-pin ${a.kind}${openId === a.id ? ' open' : ''}`;
      pin.dataset.anno = a.id;
      pin.textContent = a.id;
      pin.style.left = `${Math.max(2, x)}px`;
      pin.style.top = `${Math.max(2, y)}px`;
      pin.setAttribute('aria-label', `Annotation ${a.id}: ${a.title}`);
      layer.append(pin);
      if (openId === a.id) el.classList.add('anno-target');
    }
  }
  if (openId) positionCard();
}

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(place);
};

function renderLegend() {
  if (!legend) return;
  legend.hidden = !enabled;
  if (!enabled) return;
  const items = current();
  legend.innerHTML = `<div class="anno-lh"><b>Design annotations</b><span class="muted">${page() === 'study' ? 'study view' : 'program view'}</span>
      <button type="button" class="anno-min" aria-label="Minimise legend">–</button></div>
    <ol>${items
      .map(
        (a) => `<li><button type="button" data-anno-open="${a.id}"><span class="anno-badge ${a.kind}">${a.id}</span>${esc(a.title)}</button></li>`
      )
      .join('')}</ol>
    <p class="muted small">P = proposal, Q = open question. Click a pin or item for details. Hide all with <b>Annotations</b> in the header.</p>`;
}

function positionCard() {
  const a = ANNOTATIONS.find((x) => x.id === openId);
  const pin = layer.querySelector(`.anno-pin[data-anno="${openId}"]`);
  if (!a || !card) return;
  card.hidden = false;
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  let x;
  let y;
  if (pin) {
    const r = pin.getBoundingClientRect();
    x = Math.min(window.innerWidth - cw - 12, Math.max(12, r.left - 20));
    y = r.bottom + 8 + ch > window.innerHeight ? Math.max(12, r.top - ch - 8) : r.bottom + 8;
  } else {
    x = window.innerWidth - cw - 24;
    y = 80;
  }
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
}

function open(id) {
  openId = id;
  const a = ANNOTATIONS.find((x) => x.id === id);
  card.innerHTML = `<div class="anno-ch"><span class="anno-badge ${a.kind}">${a.id}</span><b>${esc(a.title)}</b>
      <button type="button" class="anno-x" aria-label="Close">✕</button></div>
    <div class="anno-cb">${a.body}</div>${a.source ? `<div class="anno-src">${a.source}</div>` : ''}`;
  const target = a.targets.map(findTarget).find(Boolean);
  target?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  place();
  setTimeout(schedule, 350); // after the smooth scroll settles
}

function close() {
  openId = null;
  if (card) card.hidden = true;
  schedule();
}

function setEnabled(value) {
  enabled = value;
  document.body.classList.toggle('anno-on', value);
  const btn = document.getElementById('annoBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', String(value));
    btn.classList.toggle('on', value);
    btn.querySelector('.state').textContent = value ? 'on' : 'off';
  }
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
  if (!value) close();
  renderLegend();
  schedule();
}

export function initAnnotations() {
  layer = document.createElement('div');
  layer.id = 'anno-layer';
  legend = document.createElement('aside');
  legend.id = 'anno-legend';
  card = document.createElement('div');
  card.id = 'anno-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  document.body.append(layer, legend, card);

  layer.addEventListener('click', (e) => {
    const pin = e.target.closest('.anno-pin');
    if (pin) (openId === pin.dataset.anno ? close() : open(pin.dataset.anno));
  });
  legend.addEventListener('click', (e) => {
    if (e.target.closest('.anno-min')) return legend.classList.toggle('min');
    const item = e.target.closest('[data-anno-open]');
    if (item) open(item.dataset.annoOpen);
  });
  card.addEventListener('click', (e) => {
    if (e.target.closest('.anno-x')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openId) close();
  });
  document.addEventListener('click', (e) => {
    if (openId && !e.target.closest('#anno-card, #anno-layer, #anno-legend')) close();
  });
  document.getElementById('annoBtn')?.addEventListener('click', () => setEnabled(!enabled));

  window.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true); // capture: the table scrolls horizontally on its own
  window.addEventListener('hashchange', () => {
    close();
    renderLegend();
    schedule();
  });
  new MutationObserver(schedule).observe(document.getElementById('app'), { childList: true, subtree: true });

  // ?anno=0 / ?anno=1 overrides the remembered choice (e.g. for clean screenshots).
  let stored = new URLSearchParams(location.search).get('anno');
  if (stored === null) {
    stored = '1';
    try { stored = localStorage.getItem(KEY) ?? '1'; } catch { /* storage unavailable */ }
  }
  setEnabled(stored !== '0');
}
