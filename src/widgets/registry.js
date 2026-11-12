// Build-time widget registry (W5): every widget ships inside the tested
// bundle; there is no runtime plug-in loading. A widget is:
//   { name, version, dataSpec, render(el, data, config) -> {update?}, appliesTo? }
// dataSpec keys name the contract layers the widget needs (resolve.js).
// `appliesTo(metric, config)` returns why the widget can't show that metric, or null.
// A widget that can't render is never swapped for another (#12): the host shows why.

const widgets = new Map();

// Layers that come "for free" from the standardized reporting model. A view
// that reads only these is STANDARD: it works for every site-level metric with
// no per-metric work. Anything else (listings, an external report link) is
// CUSTOM — purpose-built for a metric.
export const REPORTING_LAYERS = new Set(['results', 'history', 'bounds', 'groups', 'distributions']);

export function widgetKind(def) {
  if (def.kind) return def.kind;
  const layers = Object.keys(def.dataSpec ?? {}).filter((k) => def.dataSpec[k]);
  return layers.every((k) => REPORTING_LAYERS.has(k)) ? 'standard' : 'custom';
}

export function registerWidget(def) {
  if (!def?.name || typeof def.render !== 'function') {
    throw new Error('registerWidget: a widget needs at least {name, render}');
  }
  const full = { dataSpec: {}, label: def.name, format: 'tile', ...def };
  full.kind = widgetKind(full);
  widgets.set(def.name, full);
}

export function getWidget(name) {
  return widgets.get(name) ?? null;
}

/** Layers in dataSpec that the host does not allow. */
export function missingLayers(dataSpec = {}, allowList = []) {
  return Object.keys(dataSpec).filter((layer) => dataSpec[layer] && !allowList.includes(layer));
}

/**
 * Resolves a widget for a host: its definition, or the reason it can't render there. Nothing is substituted.
 * @param {string} name
 * @param {string[]} allowList The data layers the host carries.
 * @param {object | null} [metric] The metric the widget would show, if it is bound to one.
 * @param {object} [config]
 * @returns {{ def: any, reason: null } | { def: null, reason: string }}
 */
export function resolveWidget(name, allowList, metric = null, config = {}) {
  const def = widgets.get(name);
  if (!def) return { def: null, reason: 'it is not a registered widget' };
  const missing = missingLayers(def.dataSpec, allowList);
  if (missing.length) return { def: null, reason: `it needs the ${missing.join(', ')} data, which this page does not carry` };
  const reason = metric && def.appliesTo ? def.appliesTo(metric, config ?? {}) : null;
  return reason ? { def: null, reason } : { def, reason: null };
}

export function listWidgets() {
  return [...widgets.keys()];
}
