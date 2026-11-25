// @ts-check
// Small pieces both report pages render the same way.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { attachHoverTooltip } from '../app/tooltip.js';
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

/**
 * Calls `dismiss` on a mouse press outside `ref`'s element, or on Escape: how the header's popovers close.
 * @param {import('react').RefObject<HTMLElement | null>} ref
 * @param {() => void} dismiss
 */
export function useDismiss(ref, dismiss) {
  const latest = useRef(dismiss);
  latest.current = dismiss;
  useEffect(() => {
    const onDown = (/** @type {MouseEvent} */ e) => {
      if (ref.current && !ref.current.contains(/** @type {Node} */ (e.target))) latest.current();
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') latest.current();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref]);
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
