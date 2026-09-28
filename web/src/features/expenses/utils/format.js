/** Amounts of an expense: tomans as whole numbers, dollars with up to two decimals */
export function formatAmount(value, currency = 'IRT') {
  const n = Number(value) || 0;
  return currency === 'USD'
    ? n.toLocaleString('fa-IR', { maximumFractionDigits: 2 })
    : Math.round(n).toLocaleString('fa-IR');
}
