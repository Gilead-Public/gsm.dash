// @ts-check
import { useRef, useState } from 'react';
import { ADMIN_LABELS, ADMIN_SETTINGS } from '../app/admin-settings.js';
import { useDismiss } from './parts.jsx';

/**
 * The Admin button and its panel (#46), a demo tool: the theme, the study grid's cards per row, how Config opens and
 * the heatmap legend. The page owns the settings, and keeps them in its address.
 * @param {{ admin: Record<string, string>, onChange: (key: string, value: string) => void }} props
 */
export function AdminMenu({ admin, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  useDismiss(ref, () => setOpen(false));
  return (
    <div className="popwrap admin-menu" ref={ref}>
      <button type="button" className="hbtn" data-open="admin" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Admin
      </button>
      <div className="hpop admin-pop" data-pop="admin" role="group" aria-label="Admin" hidden={!open}>
        {ADMIN_SETTINGS.map(([key, , choices]) => (
          <div key={key} className="ctl">
            <label>{ADMIN_LABELS[key]}</label>
            <div className="seg" role="group" aria-label={ADMIN_LABELS[key]}>
              {choices.map(([value, label]) => (
                <button key={value} type="button" data-admin={key} data-value={value} aria-pressed={admin[key] === value} className={admin[key] === value ? 'on' : ''} onClick={() => onChange(key, value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
