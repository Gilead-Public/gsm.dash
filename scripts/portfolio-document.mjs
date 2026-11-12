// @ts-check
// The portfolio report's data: the metric catalog, each study's manifest entry without its file list, and the
// counts-only summary (#15). Every number the portfolio shows comes from the summary, so no study file is read.
export const PORTFOLIO_DOCUMENT_SCHEMA_VERSION = '1.0.0';

/** @param {{ manifest: any, summary: any }} data */
export function buildPortfolioDocument({ manifest, summary }) {
  return {
    schemaVersion: PORTFOLIO_DOCUMENT_SCHEMA_VERSION,
    generated: manifest.generated,
    ...(manifest.reportBase != null && { reportBase: manifest.reportBase }),
    metrics: manifest.metrics,
    studies: manifest.studies.map((/** @type {any} */ { StudyID, params, snapshots }) => ({ StudyID, params, snapshots })),
    summary,
  };
}
