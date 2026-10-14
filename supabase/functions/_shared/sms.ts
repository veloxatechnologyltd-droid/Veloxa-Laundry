// SMS length rules. Providers bill per segment:
// GSM-7 text: 160 chars in one SMS, 153 per part when split.
// Anything outside GSM-7 (emoji, curly quotes, most accents) switches the whole
// message to UCS-2: 70 chars, 67 per part. Hence "no emoji in SMS".

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f"; // each costs 2 characters (escape + char)

export function isGsm7(text: string): boolean {
  for (const ch of text) if (!GSM_BASIC.includes(ch) && !GSM_EXTENDED.includes(ch)) return false;
  return true;
}

export function smsSegments(text: string): number {
  if (isGsm7(text)) {
    let len = 0;
    for (const ch of text) len += GSM_EXTENDED.includes(ch) ? 2 : 1;
    return len <= 160 ? 1 : Math.ceil(len / 153);
  }
  const len = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0); // UTF-16 units
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

/** +233241184477 → 233241184477 (most Ghana gateways want no plus). */
export const msisdn = (e164: string) => e164.replace(/^\+/, "");
