// @ts-check
/**
 * @param {string[]} args
 * @param {string} name
 * @returns {string | undefined}
 */
export const option = (args, name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

/**
 * @param {string[]} args
 * @param {string} name
 * @returns {boolean}
 */
export const flag = (args, name) => args.includes(name);

/**
 * "8-10,14" → [8, 9, 10, 14]
 * @param {string} spec
 * @returns {number[]}
 */
export function parseIssueList(spec) {
  const out = new Set();
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) throw new Error(`bad issue list: "${part}"`);
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}
