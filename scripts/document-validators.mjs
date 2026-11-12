// The report document validators, compiled from the JSON Schemas at build time so reports carry no schema compiler.
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

/** Each virtual module id, with the schema it validates against and the schemas that one refers to. */
export const VALIDATORS = {
  'virtual:gsm/validate-study-document': { root: 'study-document', refs: ['study-snapshot', 'portfolio'] },
  'virtual:gsm/validate-portfolio-document': { root: 'portfolio-document', refs: ['portfolio', 'portfolio-summary'] },
};

/** @param {string} name */
const schema = (name) => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8'));

/**
 * A validator as an ES module. Ajv emits require() for its runtime helpers even in ESM mode, so each becomes a
 * namespace import. `__cjs` recovers module.exports whether the importer gives the namespace Node's way (exports
 * under `default`) or a bundler's way (the exports object itself).
 * @param {keyof typeof VALIDATORS} id
 */
export function validatorSource(id) {
  const { root, refs } = VALIDATORS[id];
  const ajv = new Ajv({ code: { source: true, esm: true }, allErrors: true, strict: false });
  addFormats(ajv);
  for (const ref of refs) ajv.addSchema(schema(ref));
  const source = standaloneCode(ajv, ajv.compile(schema(root)));
  const specifiers = [...new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))];
  const imports = specifiers.map((s, i) => `import * as __ns${i} from ${JSON.stringify(s)};`).join('');
  const helper = 'const __cjs = (ns) => (ns.default && ns.default.__esModule ? ns.default : ns);';
  return `${imports}${helper}${source.replace(/require\("([^"]+)"\)/g, (_, s) => `__cjs(__ns${specifiers.indexOf(s)})`)}`;
}

/** Serves the compiled validators as virtual modules to Astro's and Vitest's Vite. */
export function documentValidatorsPlugin() {
  return {
    name: 'gsm-document-validators',
    /** @param {string} id */
    resolveId: (id) => (id in VALIDATORS ? `\0${id}` : null),
    /** @param {string} id */
    load: (id) => (id.startsWith('\0') && id.slice(1) in VALIDATORS ? validatorSource(/** @type {keyof typeof VALIDATORS} */ (id.slice(1))) : null),
  };
}
