// @ts-check
import { useLayoutEffect, useRef } from 'react';
import { resolveData } from '../widgets/index.js';

/**
 * Hosts one framework widget. React owns the container; the widget's render() owns what's inside it. Every store
 * change redraws it, and each redraw, like unmounting, first destroys the gsm.viz chart the previous one made.
 * @param {{ def: any, store: any, studyId: string, metricId?: string, config?: object, version: number, className: string }} props
 */
export function Widget({ def, store, studyId, metricId, config, version, className }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const result = def.render(el, resolveData(def.dataSpec, { store, studyId, metricId }), config ?? {});
    return () => result?.chart?.destroy?.();
  }, [def, store, studyId, metricId, config, version]);
  return <div className={className} ref={ref} />;
}
