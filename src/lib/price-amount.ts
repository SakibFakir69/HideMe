/**
 * Reads the first amount out of a localized display price.
 *
 * Store prices are localized and there is no formatting API that returns a
 * number alongside the string, so "9.99", "9,99 €" and "1.234,56 €" all have
 * to compare correctly — or the discount badge silently disappears (or, worse,
 * shows a wrong percentage) outside the US.
 *
 * Returns 0 when the string carries no parseable amount, which callers treat
 * as "these two prices are not comparable".
 */
export function priceAmount(display: string): number {
  const digits = display.replace(/[^0-9.,]/g, '');
  if (!digits) return 0;
  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  let normalized = digits;
  if (lastComma !== -1 && lastDot !== -1) {
    // Both separators: the right-most one is the decimal mark, the other is
    // a grouping separator ("1.234,56" and "1,234.56").
    normalized =
      lastComma > lastDot
        ? digits.replace(/\./g, '').replace(',', '.')
        : digits.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // One comma: a decimal mark ("9,99"). Several commas and no dot: grouping
    // separators ("1,234,567"), which a single decimal mark would mangle.
    const commas = digits.split(',').length - 1;
    normalized = commas > 1 ? digits.replace(/,/g, '') : digits.replace(',', '.');
  }
  // A single dot stays as-is ("49.00"). Grouping-only values such as "1.234"
  // are not a realistic price point for this product, so they are left alone
  // rather than guessed at.
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}
