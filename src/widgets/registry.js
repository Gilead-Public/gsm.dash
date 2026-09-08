// Build-time widget registry (W5): every widget ships inside the tested
// bundle; there is no runtime plug-in loading. A widget is:
//   { name, version, dataSpec, render(el, data, config) -> {update?}, fallback? }
// dataSpec keys name the contract layers the widget needs (resolve.js).
// `fallback` names a registered widget to degrade to when the host's
// layer allow-list can't satisfy dataSpec (W2: graceful degrade, never error).

const widgets = new Map();

export function registerWidget(def) {
  if (!def?.name || typeof def.render !== 'function') {
    throw new Error('registerWidget: a widget needs at least {name, render}');
  }
  widgets.set(def.name, { dataSpec: {}, ...def });
}

/** Layers in dataSpec that the host does not allow. */
export function missingLayers(dataSpec = {}, allowList = []) {
  return Object.keys(dataSpec).filter((layer) => dataSpec[layer] && !allowList.includes(layer));
}

/**
 * Resolve a widget name against the host allow-list. Unknown names and
 * unsatisfiable dataSpecs degrade along the fallback chain, ending at
 * `defaultName`. Returns { def, degraded }.
 */
export function resolveWidget(name, allowList, defaultName = 'scalar-tile') {
  const requested = name ?? defaultName;
  let current = requested;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const def = widgets.get(current);
    if (!def) break; // unknown name -> default
    if (missingLayers(def.dataSpec, allowList).length === 0) {
      return { def, degraded: current !== requested };
    }
    current = def.fallback ?? defaultName;
  }
  const def = widgets.get(defaultName);
  if (!def) throw new Error(`resolveWidget: default widget "${defaultName}" is not registered`);
  return { def, degraded: requested !== defaultName };
}

export function listWidgets() {
  return [...widgets.keys()];
}
