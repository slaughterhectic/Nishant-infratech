// India first (this business is based in UP, near the Nepal border), then the
// rest of the immediate neighborhood. Kept intentionally short rather than a
// full ITU country list — this is for a regional cement/steel trading ledger,
// not a global consumer app. Mirrors the mobile app's src/utils/phone.ts.
export interface CountryCode {
  dialCode: string;
  iso: string;
  name: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { dialCode: '+91', iso: 'IN', name: 'India' },
  { dialCode: '+977', iso: 'NP', name: 'Nepal' },
  { dialCode: '+975', iso: 'BT', name: 'Bhutan' },
  { dialCode: '+880', iso: 'BD', name: 'Bangladesh' },
  { dialCode: '+92', iso: 'PK', name: 'Pakistan' },
  { dialCode: '+94', iso: 'LK', name: 'Sri Lanka' },
  { dialCode: '+95', iso: 'MM', name: 'Myanmar' },
  { dialCode: '+86', iso: 'CN', name: 'China' },
];

export const DEFAULT_COUNTRY_CODE = COUNTRY_CODES[0].dialCode;

export function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

// Only India gets the precise 10-digit/6-9-prefix rule this business actually
// operates under; other countries get a permissive length check since we don't
// carry per-country numbering-plan rules for the rest.
export function isValidMobileNumber(dialCode: string, raw: string): boolean {
  const digits = onlyDigits(raw);
  if (dialCode === '+91') {
    const stripped = digits.replace(/^91/, '').replace(/^0/, '');
    return /^[6-9]\d{9}$/.test(stripped);
  }
  return digits.length >= 6 && digits.length <= 12;
}

export function normalizeMobileDigits(dialCode: string, raw: string): string {
  const digits = onlyDigits(raw);
  if (dialCode === '+91') return digits.replace(/^91/, '').replace(/^0/, '');
  return digits;
}

// E.164-ish storage format, e.g. '+919876543210'.
export function toE164(dialCode: string, raw: string): string {
  return `${dialCode}${normalizeMobileDigits(dialCode, raw)}`;
}
