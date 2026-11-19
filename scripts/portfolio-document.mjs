// @ts-check
// The portfolio report's data: the metric catalog, each study's manifest entry without its file list, and the
// counts-only summary (#15). Every number the portfolio shows comes from the summary, so no study file is read.
import { configProblems } from '../src/data/portfolio-config.js';

export const PORTFOLIO_DOCUMENT_SCHEMA_VERSION = '1.0.0';

/**
 * @param {{ manifest: any, summary: any, config?: unknown }} data `config` holds the portfolio's defaults (#16), written
 *   into the document so that one template serves any configuration.
 */
export function buildPortfolioDocument({ manifest, summary, config }) {
  if (config !== undefined) {
    const problems = configProblems(config, manifest.metrics);
    if (problems.length) throw new Error(`the portfolio configuration is refused:\n  ${problems.join('\n  ')}`);
  }
  return {
    schemaVersion: PORTFOLIO_DOCUMENT_SCHEMA_VERSION,
    generated: manifest.generated,
    ...(manifest.reportBase != null && { reportBase: manifest.reportBase }),
    metrics: manifest.metrics,
    studies: manifest.studies.map((/** @type {any} */ { StudyID, params, snapshots }) => ({ StudyID, params, snapshots })),
    summary,
    ...(config !== undefined && { config }),
  };
}
