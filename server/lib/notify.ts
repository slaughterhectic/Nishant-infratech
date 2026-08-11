import { getOne } from '../db/database';

export type NotificationEvent =
  | 'order_requested'
  | 'order_punched'
  | 'dispatch_created'
  | 'otp_generated'
  | 'otp_verified'
  | 'payment_received'
  | 'advance_requested'
  | 'driver_otp_submitted';

/**
 * Single choke point for every "something happened, tell someone" event in
 * the app (order punched, OTP generated/verified, payment received).
 *
 * Phase 1 just writes to `dispatch_notifications` and the UI polls it as an
 * in-app activity feed — no real WhatsApp/SMS cost, per the client's explicit
 * call to avoid a paid OTP-SMS gateway (~Rs 2000/mo) until the business is
 * running. When a real WhatsApp Business API / SMS provider is wired up
 * later, that call goes HERE and nowhere else — every call site below stays
 * unchanged.
 */
export async function notifyEvent(opts: {
  dispatchId?: number | null;
  eventType: NotificationEvent;
  message: string;
  recipientRole?: string | null;
}) {
  const row = await getOne(
    `INSERT INTO dispatch_notifications (dispatch_id, event_type, message, recipient_role)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [opts.dispatchId ?? null, opts.eventType, opts.message, opts.recipientRole ?? null]
  );
  // TODO(phase 2): if a WhatsApp Business API / SMS provider is configured,
  // send `opts.message` to the relevant phone number here as well.
  return row;
}

export function generateOtp(length = 4): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}
