// @ts-check
// Small pieces both report pages render the same way.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { attachHoverTooltip, metricTip } from '../components/tooltip.js';
import { metricParts } from '../util/format.js';
import { sparkline } from '../charts/sparkline.js';

/**
 * A study report's address, carrying the portfolio's view in its hash.
 * @param {any} store
 * @param {string} studyId
 */
export function studyHref(store, studyId) {
  const view = store.programParams().toString();
  return `./${encodeURIComponent(studyId)}.html${view ? `#${view}` : ''}`;
}

/** @param {{ metric: any }} props */
export function InfoIcon({ metric }) {
  return (
    <span className="info" data-tip={metricTip(metric)} role="img" aria-label={`${metric.Metric} definition`}>
      i
    </span>
  );
}

/** @param {{ metric: any }} props */
export function StatusPill({ metric }) {
  const status = metric?.Status ?? 'Released';
  return status === 'Released' ? null : <span className={`pill ${status.toLowerCase()}`}>{status}</span>;
}

/**
 * A rollup by its metric's display rule, as fmtMetric renders it.
 * @param {{ metric: any, rollup: any }} props
 */
export function MetricValue({ metric, rollup }) {
  const parts = metricParts(metric, rollup);
  if (!parts) return <span className="muted">—</span>;
  return (
    <>
      {parts.main}
      {parts.pc && <span className="pc">{parts.pc}</span>}
    </>
  );
}

/**
 * Wires the shared hover tooltip to an element once it exists.
 * @returns {import('react').RefObject<HTMLDivElement | null>}
 */
export function useHoverTooltip() {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  useEffect(() => {
    if (ref.current) attachHoverTooltip(ref.current);
  }, []);
  return ref;
}

/**
 * A trend sparkline, drawn into its span after render.
 * @param {{ index: number, series: any[], label: string }} props
 */
export function Sparkline({ index, series, label }) {
  const ref = useRef(/** @type {HTMLSpanElement | null} */ (null));
  useLayoutEffect(() => {
    if (ref.current) sparkline(ref.current, series, { width: 64, height: 20, label });
  });
  return <span className="spark" data-spark={index} ref={ref} />;
}
