/**
 * Broker-agnostic CSV normalization utilities
 * Handles all broker-specific formatting quirks in a deterministic way
 */

/**
 * Parse a money/number field: removes $ , () % and whitespace.
 * Handles international formats and broker-specific negative representations.
 * Returns NaN if parsing fails.
 */
export function parseNumber(raw: string | number | null | undefined): number {
  if (raw == null) return NaN;
  if (typeof raw === 'number') return isNaN(raw) ? NaN : raw;
  
  const s = String(raw).trim();
  if (!s) return NaN;

  console.log(`🔍 Parsing value: "${raw}"`);

  let isNegative = false;

  // Handle parentheses formats: (500), ($500), (500.00), etc.
  const parenthesesPatterns = [
    /^\s*\(\s*\$?([0-9,.-]+)\s*\)\s*$/,
    /^\s*\(\s*([0-9,.-]+)\s*\)\s*$/,
    /^\s*\$\s*\(\s*([0-9,.-]+)\s*\)\s*$/,
  ];

  let cleanValue = s;
  for (const pattern of parenthesesPatterns) {
    const match = cleanValue.match(pattern);
    if (match) {
      isNegative = true;
      cleanValue = match[1];
      console.log(`💰 Found parentheses format: "${raw}" -> negative: ${cleanValue}`);
      break;
    }
  }

  // Check for trailing minus: 500-, $500-, 500.00-
  if (!isNegative && cleanValue.match(/.*-\s*$/)) {
    isNegative = true;
    cleanValue = cleanValue.replace(/-\s*$/, '');
    console.log(`➖ Found trailing minus: "${raw}" -> negative: ${cleanValue}`);
  }

  // Check for leading minus
  if (!isNegative && cleanValue.startsWith('-')) {
    isNegative = true;
    cleanValue = cleanValue.slice(1);
    console.log(`⬅️ Found leading minus: "${raw}" -> negative: ${cleanValue}`);
  }

  // Remove currency symbols and spaces first, but keep numbers, commas, and periods
  cleanValue = cleanValue.replace(/[$%\s€£¥₹¢₨₩₪₫₡₦₨₱₽₪₴₸₼₿]+/g, '');
  
  // Handle international number formats intelligently
  const commaCount = (cleanValue.match(/,/g) || []).length;
  const periodCount = (cleanValue.match(/\./g) || []).length;
  
  if (commaCount === 0 && periodCount <= 1) {
    // Simple case: no commas, at most one period (e.g., "123.45" or "123")
    cleanValue = cleanValue.replace(/[^0-9.]/g, '');
  } else if (commaCount > 0 && periodCount === 0) {
    // Only commas present
    const lastCommaIndex = cleanValue.lastIndexOf(',');
    const afterLastComma = cleanValue.substring(lastCommaIndex + 1);
    
    if (afterLastComma.length <= 3 && /^\d+$/.test(afterLastComma)) {
      // Likely decimal separator (e.g., "123,45" or "1234,56")
      cleanValue = cleanValue.replace(',', '.').replace(/[^0-9.]/g, '');
      console.log(`🌍 Detected comma as decimal separator: "${raw}" -> "${cleanValue}"`);
    } else {
      // Likely thousands separators (e.g., "1,234,567")
      cleanValue = cleanValue.replace(/,/g, '').replace(/[^0-9]/g, '');
      console.log(`🌍 Detected commas as thousands separators: "${raw}" -> "${cleanValue}"`);
    }
  } else if (commaCount > 0 && periodCount > 0) {
    // Both commas and periods present
    const lastCommaIndex = cleanValue.lastIndexOf(',');
    const lastPeriodIndex = cleanValue.lastIndexOf('.');
    
    if (lastCommaIndex > lastPeriodIndex) {
      // Comma comes after period, comma is decimal separator (e.g., "1.234,56")
      const beforeDecimal = cleanValue.substring(0, lastCommaIndex).replace(/[^0-9]/g, '');
      const afterDecimal = cleanValue.substring(lastCommaIndex + 1).replace(/[^0-9]/g, '');
      cleanValue = beforeDecimal + '.' + afterDecimal;
      console.log(`🌍 Detected European format (period=thousands, comma=decimal): "${raw}" -> "${cleanValue}"`);
    } else {
      // Period comes after comma, period is decimal separator (e.g., "1,234.56")
      const beforeDecimal = cleanValue.substring(0, lastPeriodIndex).replace(/[^0-9]/g, '');
      const afterDecimal = cleanValue.substring(lastPeriodIndex + 1).replace(/[^0-9]/g, '');
      cleanValue = beforeDecimal + '.' + afterDecimal;
      console.log(`🌍 Detected US format (comma=thousands, period=decimal): "${raw}" -> "${cleanValue}"`);
    }
  } else {
    // Multiple periods, no commas - remove all but last period
    const lastPeriodIndex = cleanValue.lastIndexOf('.');
    if (lastPeriodIndex !== -1) {
      const beforeDot = cleanValue.substring(0, lastPeriodIndex).replace(/[^0-9]/g, '');
      const afterDot = cleanValue.substring(lastPeriodIndex + 1).replace(/[^0-9]/g, '');
      cleanValue = beforeDot + '.' + afterDot;
    } else {
      cleanValue = cleanValue.replace(/[^0-9]/g, '');
    }
  }

  if (cleanValue === '.' || cleanValue === '') {
    return NaN;
  }

  const parsed = parseFloat(cleanValue);
  const result = isNaN(parsed) ? NaN : parsed;
  const finalValue = isNegative ? -Math.abs(result) : result;
  
  if (isNegative || Math.abs(result) > 0) {
    console.log(`✅ Final parsed value: "${raw}" -> ${finalValue} (negative: ${isNegative})`);
  }
  
  return finalValue;
}

/**
 * Try to deduce BUY / SELL from any clues we have.
 * Handles all known broker variations and signed quantities.
 */
export function inferSide(
  explicit: string | null | undefined,
  qty: number,
  entryPrice?: number,
  exitPrice?: number,
): 'BUY' | 'SELL' | null {
  // 1) Explicit field wins
  if (explicit) {
    const t = explicit.toString().trim().toUpperCase();
    
    // Standard variations
    if (['BUY', 'B', 'LONG', 'L'].includes(t)) return 'BUY';
    if (['SELL', 'S', 'SHORT', 'SH', 'SL'].includes(t)) return 'SELL';
    
    // Numeric variations
    if (['1', '+1'].includes(t)) return 'BUY';
    if (['-1', '0'].includes(t)) return 'SELL';
    
    // Entry/Exit variations
    if (['ENTRY', 'OPEN', 'IN'].includes(t)) return 'BUY';
    if (['EXIT', 'CLOSE', 'OUT'].includes(t)) return 'SELL';
    
    // Other broker-specific codes
    if (t.includes('LONG') || t.includes('BUY')) return 'BUY';
    if (t.includes('SHORT') || t.includes('SELL')) return 'SELL';
  }

  // 2) Signed quantity wins
  if (!isNaN(qty)) {
    if (qty < 0) return 'SELL';
    if (qty > 0) return 'BUY';
  }

  // 3) Entry/exit prices (Tradovate-style rule)
  if (entryPrice != null && exitPrice != null && !isNaN(entryPrice) && !isNaN(exitPrice)) {
    return exitPrice >= entryPrice ? 'BUY' : 'SELL';
  }

  console.warn(`⚠️ Could not infer side from: explicit="${explicit}", qty=${qty}, entryPrice=${entryPrice}, exitPrice=${exitPrice}`);
  return null; // Give up → mark row invalid
}

/**
 * Normalize a symbol string for consistency
 */
export function normalizeSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  
  const symbol = raw.toString().trim().toUpperCase();
  if (!symbol) return null;
  
  // Remove common prefixes/suffixes that some brokers add
  return symbol
    .replace(/^(NASDAQ:|NYSE:|AMEX:)/i, '')
    .replace(/\.(US|USA)$/i, '')
    .trim();
}

/**
 * Parse tags from a string (comma or semicolon separated)
 */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  
  return raw
    .toString()
    .split(/[,;]/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

/**
 * Validate that a datetime string can be parsed
 */
export function validateDateTime(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  
  const date = new Date(raw.toString());
  if (isNaN(date.getTime())) return null;
  
  // Sanity checks
  const now = new Date();
  const minDate = new Date('2000-01-01');
  
  if (date > now) {
    console.warn(`⚠️ Future datetime detected: ${raw}`);
    return null;
  }
  
  if (date < minDate) {
    console.warn(`⚠️ Very old datetime detected: ${raw}`);
    return null;
  }
  
  return date;
}