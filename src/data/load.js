// Two load modes, one contract (design doc §4.4). Fetched: manifest + study
// snapshot files from a static host. Embedded: the same JSON inlined in
// <script type="application/json" data-gsm="..."> blocks for self-contained
// HTML / htmlwidget embedding. Auto-detected by loadPortfolio().

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
  return res.json();
}

export function readEmbedded(doc = document) {
  const manifestEl = doc.querySelector('script[type="application/json"][data-gsm="portfolio"]');
  if (!manifestEl) return null;
  const manifest = JSON.parse(manifestEl.textContent);
  const snapshots = [...doc.querySelectorAll('script[type="application/json"][data-gsm="snapshot"]')].map(
    (el) => JSON.parse(el.textContent)
  );
  return { manifest, snapshots };
}

export async function fetchPortfolio(baseUrl) {
  const manifest = await fetchJSON(`${baseUrl}/portfolio.json`);
  const paths = manifest.studies.flatMap((s) => Object.values(s.files));
  const snapshots = await Promise.all(paths.map((p) => fetchJSON(`${baseUrl}/${p}`)));
  return { manifest, snapshots };
}

/** Embedded data wins when present; otherwise fetch from baseUrl. */
export async function loadPortfolio({ baseUrl = 'examples/data', doc = document } = {}) {
  return readEmbedded(doc) ?? fetchPortfolio(baseUrl);
}
