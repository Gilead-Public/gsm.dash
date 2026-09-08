// Build-time registry: importing this module registers the shipped widget set.
import './scalar-tile.js';
import './breakdown-bar.js';
import './link-out.js';
import './threshold-list.js';

export { registerWidget, resolveWidget, missingLayers, listWidgets } from './registry.js';
export { resolveData } from './resolve.js';
