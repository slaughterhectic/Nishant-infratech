import twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_SMS_FROM } = process.env;

const configured = !!(TWILIO_ACCOUNT_SID && TWILIO_API_KEY_SID && TWILIO_API_KEY_SECRET && TWILIO_SMS_FROM);

const client = configured
  ? twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID })
  : null;

export function isSmsConfigured() {
  return configured;
}

function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `+${digits.length === 10 ? `91${digits}` : digits}`;
}

/**
 * TEMPORARY trial-account workaround: Twilio trial accounts can only send
 * SMS using one of a small set of predefined template names as the `Body`
 * (real content is rejected with error 572006) — `sms_2fa` sends a real,
 * real-time-delivered SMS whose fixed text contains a verification code.
 * Since we can't inject our own OTP into that text, we do it the other way
 * round: send it, then pull the code Twilio actually put in the message back
 * out and use THAT as the dispatch's stored otp_code, so what the customer
 * receives always matches what verification expects.
 *
 * Remove this whole file once the account is upgraded — at that point
 * generateOtp() + a real Content Template covers this properly and this
 * extraction hack is no longer needed.
 */
export async function sendTrialVerificationSms(phone: string | null | undefined): Promise<{ sent: boolean; code: string | null }> {
  if (!client || !phone) return { sent: false, code: null };
  const to = toE164(phone);
  if (!to) return { sent: false, code: null };
  try {
    const msg = await client.messages.create({ from: TWILIO_SMS_FROM, to, body: 'sms_2fa' });
    const match = msg.body?.match(/\b(\d{4,8})\b/);
    return { sent: true, code: match ? match[1] : null };
  } catch (e: any) {
    console.error('Twilio trial SMS send failed', { to, error: e?.message });
    return { sent: false, code: null };
  }
}
