// The study document validator, compiled from the JSON Schemas at build time so reports carry no schema compiler.
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

export const VALIDATOR_ID = 'virtual:gsm/validate-study-document';

/** @param {string} name */
const schema = (name) => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8'));

/**
 * The validator as an ES module. Ajv emits require() for its runtime helpers even in ESM mode, so each becomes a
 * namespace import. `__cjs` recovers module.exports whether the importer gives the namespace Node's way (exports
 * under `default`) or a bundler's way (the exports object itself).
 */
export function studyValidatorSource() {
  const ajv = new Ajv({ code: { source: true, esm: true }, allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(schema('study-snapshot'));
  ajv.addSchema(schema('portfolio'));
  const source = standaloneCode(ajv, ajv.compile(schema('study-document')));
  const specifiers = [...new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))];
  const imports = specifiers.map((s, i) => `import * as __ns${i} from ${JSON.stringify(s)};`).join('');
  const helper = 'const __cjs = (ns) => (ns.default && ns.default.__esModule ? ns.default : ns);';
  return `${imports}${helper}${source.replace(/require\("([^"]+)"\)/g, (_, s) => `__cjs(__ns${specifiers.indexOf(s)})`)}`;
}

/** Serves the compiled validator as a virtual module to Astro's and Vitest's Vite. */
export function studyValidatorPlugin() {
  const resolved = `\0${VALIDATOR_ID}`;
  return {
    name: 'gsm-study-validator',
    /** @param {string} id */
    resolveId: (id) => (id === VALIDATOR_ID ? resolved : null),
    /** @param {string} id */
    load: (id) => (id === resolved ? studyValidatorSource() : null),
  };
}
