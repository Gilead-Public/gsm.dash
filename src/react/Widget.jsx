// @ts-check
import { useLayoutEffect, useRef } from 'react';
import { resolveData } from '../widgets/index.js';

/**
 * Hosts one framework widget. React owns the container; the widget's render() owns what's inside it. Every store
 * change redraws it, and each redraw, like unmounting, first destroys the gsm.viz chart the previous one made.
 * @param {{ def: any, store: any, studyId: string, metricId?: string, config?: object, version: number, className: string, degradedFrom?: string, note?: string }} props
 */
export function Widget({ def, store, studyId, metricId, config, version, className, degradedFrom, note }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const result = def.render(el, resolveData(def.dataSpec, { store, studyId, metricId }), config ?? {});
    if (note) el.insertAdjacentHTML('afterbegin', note);
    return () => result?.chart?.destroy?.();
  }, [def, store, studyId, metricId, config, version, note]);
  return <div className={className} ref={ref} data-degraded-from={degradedFrom} />;
}
