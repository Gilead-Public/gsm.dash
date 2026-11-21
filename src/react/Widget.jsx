// @ts-check
import { useLayoutEffect, useRef, useState } from 'react';
import { resolveData } from '../widgets/index.js';

/**
 * Hosts one framework widget. React owns the container; the widget's render() owns what's inside it. Every store
 * change redraws it, and each redraw, like unmounting, first destroys the gsm.viz chart the previous one made. A
 * widget that fits itself to its box (`fits`) is also redrawn when the box changes size. Each draw announces itself
 * (`widget-drawn`), so the page can size its cards to it.
 * @param {{ def: any, store: any, studyId: string, metricId?: string, config?: object, version: number, className: string }} props
 */
export function Widget({ def, store, studyId, metricId, config, version, className }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [box, setBox] = useState('');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !def.fits || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setBox(`${el.clientWidth}x${el.clientHeight}`));
    observer.observe(el);
    return () => observer.disconnect();
  }, [def]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const result = def.render(el, resolveData(def.dataSpec, { store, studyId, metricId }), config ?? {});
    el.dispatchEvent(new Event('widget-drawn', { bubbles: true }));
    return () => result?.chart?.destroy?.();
  }, [def, store, studyId, metricId, config, version, box]);
  return <div className={className} ref={ref} />;
}
