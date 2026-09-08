// Environment-free formatting helpers, shared by widgets and components.
export const esc = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const fmtPct = (rate, digits = 1) => (rate == null ? '—' : `${(rate * 100).toFixed(digits)}%`);

export const fmtInt = (value) => Number(value).toLocaleString('en-US');
