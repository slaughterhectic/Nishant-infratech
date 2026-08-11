// Free path for delivering the OTP: a pre-filled "click to send" WhatsApp
// link opened from the sender's own phone/WhatsApp Web — zero API cost, zero
// monthly fee. Upgrade path (Meta Cloud API direct, ~₹0.13/message, no BSP
// subscription) plugs into the same server-side notifyEvent() later without
// touching this file's callers.
export function waLink(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

export function dispatchOtpMessage(opts: {
  dispatchNumber: string; partyName?: string; quantity: number; unit: string; productName: string;
  vehicleNumber?: string; otpCode: string;
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
