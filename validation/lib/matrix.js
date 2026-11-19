// @ts-check
/** @typedef {import('./gate.js').GateResult} GateResult */
/** @typedef {import('./record.js').RunRecord} RunRecord */
/** @typedef {import('./baseline.js').BaselineIssue} BaselineIssue */
/** @typedef {import('./gate.js').Automated} Automated */

/**
 * @param {string} s
 */
const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
/**
 * @param {string} s
 */
const cell = (s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const APPROVAL = /^(\d+\.\d{2}): (not classified|classification not reviewed)$/;

/**
 * Failures for display: per-criterion approval failures collapse into one line naming the criteria, so they don't
 * read like failing tests. Everything else is listed as is.
 * @param {string[]} failures
 * @returns {string[]}
 */
export function groupFailures(failures) {
  const pending = failures.map((f) => APPROVAL.exec(f)).filter((m) => m !== null).map((m) => m[1]);
  const rest = failures.filter((f) => !APPROVAL.test(f));
  if (!pending.length) return rest;
  const ids = [...new Set(pending)];
  return [`${ids.length} criteria await classification approval (their tests are judged separately): ${ids.join(', ')}`, ...rest];
}

/**
 * @param {RunRecord} run
 * @returns {string}
 */
export function environmentLine(run) {
  const e = run.environment;
  if (!e) return 'not recorded';
  const pkgs = Object.entries(e.packages).map(([p, v]) => `${p} ${v}`).join(', ');
  const r = e.r === undefined ? '' : ` · R ${e.r ?? 'not installed'}`;
  return `Node ${e.node} (npm ${e.npm})${r} · ${e.browser.name} ${e.browser.version} · ${e.os} ${e.arch} · ${pkgs} · package-lock ${e.lockfileSha256.slice(0, 12)}`;
}

/**
 * @param {RunRecord} run
 * @param {GateResult} gate
 */
function summary(run, gate) {
  const counts = { pass: 0, fail: 0, missing: 0, unapproved: 0, pending: 0 };
  for (const c of gate.criteria) counts[c.automated]++;
  return { counts, awaiting: gate.criteria.filter((c) => c.inScope && c.acceptance === 'awaiting').length };
}

/**
 * @typedef {object} RollupIssue
 * @property {number} number
 * @property {string} title
 * @property {boolean} inScope
 * @property {number} criteria
 * @property {Record<Automated, number>} counts
 * @property {number} awaiting Visual criteria in scope that still await acceptance.
 */

/**
 * Each parent requirement with the issues under it and their criteria's status. Issues without a parent come last.
 * @param {BaselineIssue[]} issues
 * @param {GateResult} gate
 * @returns {{ parent: string | null; issues: RollupIssue[] }[]}
 */
export function requirementRollup(issues, gate) {
  /** @type {Map<string | null, RollupIssue[]>} */
  const groups = new Map();
  for (const issue of issues) {
    const own = gate.criteria.filter((c) => c.issue === issue.number);
    /** @type {Record<Automated, number>} */
    const counts = { pass: 0, fail: 0, missing: 0, unapproved: 0, pending: 0 };
    for (const c of own) counts[c.automated]++;
    const row = {
      number: issue.number,
      title: issue.title,
      inScope: own.some((c) => c.inScope),
      criteria: own.length,
      counts,
      awaiting: own.filter((c) => c.inScope && c.acceptance === 'awaiting').length,
    };
    groups.set(issue.parent, [...(groups.get(issue.parent) ?? []), row]);
  }
  const orphans = groups.get(null);
  groups.delete(null);
  const out = [...groups].map(([parent, rows]) => ({ parent, issues: rows }));
  return orphans ? [...out, { parent: null, issues: orphans }] : out;
}

const NO_PARENT = 'No parent requirement';
const ROLLUP_HEAD = ['Issue', 'In scope', 'Criteria', 'Pass', 'Fail', 'Missing', 'Unapproved', 'Pending', 'Awaiting acceptance'];
/**
 * @param {RollupIssue} i
 */
const rollupCells = (i) => [i.inScope ? 'yes' : 'no', i.criteria, i.counts.pass, i.counts.fail, i.counts.missing, i.counts.unapproved, i.counts.pending, i.awaiting];

/**
 * The issues in scope, and the PR stack they came from when the PR is stacked on others.
 * @param {RunRecord} run
 */
export function scopeDetail(run) {
  const issues = `issues ${run.scope.issues.map((n) => `#${n}`).join(', ') || 'none'}`;
  const stack = run.scope.stack ?? [];
  if (stack.length < 2) return issues;
  return `${issues}; PR ${stack.map((s) => `#${s.pr}`).join(' on ')}`;
}

/**
 * @param {RunRecord} run
 * @param {GateResult} gate
 * @param {BaselineIssue[]} [issues] The baseline's issues; with them the matrix opens with the roll-up by requirement.
 * @returns {string}
 */
export function matrixMarkdown(run, gate, issues = []) {
  const { counts, awaiting } = summary(run, gate);
  const out = [
    `# Traceability matrix · ${run.validation.toUpperCase()}`,
    '',
    `Run \`${run.runId}\` · commit \`${run.commit.slice(0, 12)}\` · baseline \`${run.baselineHash.slice(0, 12)}\` · ${run.startedAt}`,
    '',
    `Environment: ${environmentLine(run)}`,
    '',
    `**In scope: ${gate.inScope} of ${gate.criteria.length} criteria** (${scopeDetail(run)}). ` +
      `Pass ${counts.pass} · fail ${counts.fail} · missing ${counts.missing} · unapproved ${counts.unapproved} · pending ${counts.pending} · visual awaiting acceptance ${awaiting} · untraced tests ${gate.untraced}.`,
    '',
];
  if (run.failures.length) out.push('## Failures', '', ...groupFailures(run.failures).map((f) => `- ${cell(f)}`), '');
  if (run.warnings.length) out.push('## Warnings', '', ...run.warnings.map((w) => `- ${cell(w)}`), '');
  if (issues.length) out.push('## Requirements', '');
  for (const group of requirementRollup(issues, gate)) {
    out.push(`### ${group.parent ?? NO_PARENT}`, '', `| ${ROLLUP_HEAD.join(' | ')} |`, `|${ROLLUP_HEAD.map(() => '---').join('|')}|`);
    for (const i of group.issues) out.push(`| #${i.number} ${cell(i.title)} | ${rollupCells(i).join(' | ')} |`);
    out.push('');
  }
  out.push('## Criteria', '', '| Criterion | Kind | Automated | Acceptance | Tests | Evidence | Text |', '|---|---|---|---|---|---|---|');
  for (const c of gate.criteria) {
    const tests = c.tests.map((t) => `${t.outcome}${t.mode ? ` [${t.artifact}/${t.mode}]` : ''}`).join(', ') || '—';
    const evidence = c.evidence.map((e) => `[${e.artifact}/${e.mode}] ${e.sha256.slice(0, 10) || 'missing'}`).join(', ') || '—';
    out.push(`| ${c.id} | ${c.kind ?? '—'} | ${c.automated} | ${c.acceptance} | ${cell(tests)} | ${cell(evidence)} | ${cell(c.text)} |`);
  }
  const traced = gate.criteria.filter((c) => c.tests.length || c.evidence.length);
  if (traced.length) out.push('', '## Tests and evidence', '');
  for (const c of traced) {
    out.push(`### ${c.id} · ${c.kind ?? 'unclassified'} · ${c.automated}${c.inScope ? '' : ' (not in scope)'}`, '');
    for (const t of c.tests) out.push(`- ${t.outcome}${t.mode ? ` [${t.artifact}/${t.mode}]` : ''} \`${t.file}\` › ${cell(t.title)}`);
    for (const e of c.evidence) out.push(`- evidence [${e.artifact}/${e.mode}] [${e.path}](${encodeURI(e.path)}) \`${e.sha256.slice(0, 12) || 'missing'}\` from \`${e.file}\` › ${cell(e.test)}`);
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

/**
 * @param {RunRecord} run
 * @param {GateResult} gate
 * @param {BaselineIssue[]} [issues]
 * @returns {string}
 */
export function matrixHtml(run, gate, issues = []) {
  const { counts, awaiting } = summary(run, gate);
  const rows = gate.criteria
    .map((c) => {
      const tests = c.tests.map((t) => `<li class="${t.outcome}">${esc(t.outcome)}${t.mode ? ` [${t.artifact}/${t.mode}]` : ''}: ${esc(t.title)} <code>${esc(t.file)}</code></li>`).join('');
      const evidence = c.evidence.map((e) => `<li><a href="${esc(encodeURI(e.path))}">[${e.artifact}/${e.mode}] ${esc(e.sha256.slice(0, 12) || 'missing')}</a> <span title="${esc(`${e.file} › ${e.test}`)}">${esc(e.test)}</span></li>`).join('');
      return `<tr class="${c.automated}"><td>${c.id}</td><td>${c.kind ?? '—'}</td><td>${c.automated}</td><td>${c.acceptance}</td><td><ul>${tests}</ul></td><td><ul>${evidence}</ul></td><td>${esc(c.text)}</td></tr>`;
    })
    .join('\n');
  const rollup = requirementRollup(issues, gate)
    .map((group) => {
      const body = group.issues.map((i) => `<tr><td>#${i.number} ${esc(i.title)}</td>${rollupCells(i).map((v) => `<td>${v}</td>`).join('')}</tr>`).join('\n');
      return `<h3>${esc(group.parent ?? NO_PARENT)}</h3><table><thead><tr>${ROLLUP_HEAD.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>\n${body}\n</tbody></table>`;
    })
    .join('\n');
  /**
   * @param {string} title
   * @param {string[]} items
   */
  const list = (title, items) => (items.length ? `<h2>${title}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Traceability matrix ${esc(run.runId)}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top;text-align:left}
ul{margin:0;padding-left:16px}tr.fail td:nth-child(3),tr.missing td:nth-child(3),li.failed{color:#b00020}tr.pass td:nth-child(3){color:#1b5e20}tr.unapproved td:nth-child(3){color:#8a5a00}tr.pending{color:#666}</style></head><body>
<h1>Traceability matrix · ${run.validation.toUpperCase()}</h1>
<p>Run <code>${esc(run.runId)}</code> · commit <code>${esc(run.commit.slice(0, 12))}</code> · baseline <code>${esc(run.baselineHash.slice(0, 12))}</code> · ${esc(run.startedAt)}</p>
<p>Environment: ${esc(environmentLine(run))}</p>
<p><strong>In scope: ${gate.inScope} of ${gate.criteria.length} criteria</strong> (${esc(scopeDetail(run))}). Pass ${counts.pass} · fail ${counts.fail} · missing ${counts.missing} · unapproved ${counts.unapproved} · pending ${counts.pending} · visual awaiting acceptance ${awaiting} · untraced tests ${gate.untraced}.</p>
${list('Failures', groupFailures(run.failures))}${list('Warnings', run.warnings)}
${rollup ? `<h2>Requirements</h2>\n${rollup}\n` : ''}<h2>Criteria</h2><table><thead><tr><th>Criterion</th><th>Kind</th><th>Automated</th><th>Acceptance</th><th>Tests</th><th>Evidence</th><th>Text</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>
`;
}
