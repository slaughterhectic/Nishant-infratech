import twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_WHATSAPP_FROM } = process.env;

const configured = !!(TWILIO_ACCOUNT_SID && TWILIO_API_KEY_SID && TWILIO_API_KEY_SECRET && TWILIO_WHATSAPP_FROM);

// API Key auth (not the primary Auth Token) — Twilio's recommended practice,
// scoped/revocable without touching other integrations on the account.
const client = configured
  ? twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID })
  : null;

export function isWhatsAppConfigured() {
  return configured;
}

function toWhatsAppAddress(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `whatsapp:+${withCountryCode}`;
}

/**
 * Best-effort WhatsApp send via Twilio. Never throws — a failed/unconfigured
 * send should not break the dispatch flow, since the in-app notification and
 * the free wa.me click-to-send link (client-side) are always there as a
 * fallback. Returns whether it actually sent, for callers that want to know.
 *
 * Sandbox caveat: the recipient must have first sent the Twilio sandbox join
 * code from their own WhatsApp before they can receive messages here.
 */
export async function sendWhatsAppMessage(phone: string | null | undefined, body: string): Promise<boolean> {
  if (!client || !phone) return false;
  const to = toWhatsAppAddress(phone);
  if (!to) return false;
  try {
    await client.messages.create({ from: TWILIO_WHATSAPP_FROM, to, body });
    return true;
  } catch (e: any) {
    console.error('Twilio WhatsApp send failed', { to, error: e?.message });
    return false;
  }
}

// Mirrors client/src/lib/whatsapp.ts's dispatchOtpMessage — keep the two in sync.
export function dispatchOtpMessage(opts: {
  dispatchNumber: string; partyName?: string | null; quantity: number; unit: string; productName: string;
  vehicleNumber?: string | null; otpCode: string;
}) {
  return [
    'Nishant Infratech',
    opts.partyName ? `Dear ${opts.partyName},` : undefined,
    `${opts.quantity} ${opts.unit} ${opts.productName}`,
    opts.vehicleNumber ? `Vehicle: ${opts.vehicleNumber}` : undefined,
    `Dispatch No: ${opts.dispatchNumber}`,
    '',
    'Please share this OTP with our office once you receive the material.',
    `OTP: ${opts.otpCode}`,
  ].filter(Boolean).join('\n');
}
