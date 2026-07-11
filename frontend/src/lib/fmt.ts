const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const dateFmtIntl = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const EM_DASH = '—';

export const inr = (n: number | undefined): string => (n === undefined ? EM_DASH : inrFmt.format(n));
export const qtyFmt = (n: number, unit: string): string => `${n.toLocaleString('en-IN')} ${unit}`;
export const dateFmt = (d: Date): string => dateFmtIntl.format(d);
export const monthValue = (d: Date): string => d.toISOString().slice(0, 7);

/** "PURCHASE_IN" -> "Purchase in" — humanizes @gym/shared enum values for chip labels. */
export const enumLabel = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
