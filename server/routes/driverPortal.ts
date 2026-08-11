import { Router } from 'express';
import { getAll, getOne, query } from '../db/database';
import { friendlyError } from '../lib/userError';
import { notifyEvent } from '../lib/notify';

const router = Router();

function requireDriver(req: any, res: any): number | null {
  if (req.user.role !== 'driver') { res.status(403).json({ error: 'Driver accounts only' }); return null; }
  if (!req.user.linkedDriverId) {
    res.status(403).json({ error: 'Your account is not linked to a driver record — ask the owner to fix this in User Management.' });
    return null;
  }
  return req.user.linkedDriverId;
}

// GET /api/driver/my-deliveries — dispatches this driver is (or was) carrying,
// read-only status view (mirrors the "Today's Trips / Pending OTP / Completed" poster mockup).
router.get('/my-deliveries', async (req, res) => {
  const driverId = requireDriver(req, res);
  if (!driverId) return;
  try {
    const rows = await getAll(`
      SELECT d.id, ('DSP-' || (1000+d.id)) as dispatch_number, d.date, d.status,
        d.quantity, d.product_id, pr.name as product_name, pr.unit,
        p.name as party_name, v.vehicle_number, d.destination_address,
        dl.name as destination_location_name, d.driver_submitted_otp, d.driver_submitted_at
      FROM dispatches d
      JOIN products pr ON pr.id = d.product_id
      LEFT JOIN parties p ON p.id = d.party_id
      LEFT JOIN vehicles v ON v.id = d.vehicle_id
      LEFT JOIN locations dl ON dl.id = d.destination_location_id
      WHERE d.driver_id = $1 AND d.status != 'cancelled'
      ORDER BY d.date DESC, d.id DESC LIMIT 30
    `, [driverId]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// POST /api/driver/request-advance — surfaces in the owner's notification bell.
router.post('/request-advance', async (req, res) => {
  const driverId = requireDriver(req, res);
  if (!driverId) return;
  try {
    const { amount, note } = req.body as { amount: number; note?: string };
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
    const driver = await getOne('SELECT name FROM drivers WHERE id=$1', [driverId]);
    await notifyEvent({
      eventType: 'advance_requested',
      recipientRole: 'owner',
      message: `${driver?.name || 'A driver'} requested an advance of ₹${Number(amount).toLocaleString('en-IN')}${note ? ` — ${note}` : ''}`,
    });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// POST /api/driver/submit-otp — driver types in the code the customer read
// back to them. This does NOT verify the delivery by itself; it just lands
// on the owner's OTP Confirmations screen for a one-tap match/discard,
// keeping a human in the loop instead of trusting the driver's phone blindly.
router.post('/submit-otp', async (req, res) => {
  const driverId = requireDriver(req, res);
  if (!driverId) return;
  try {
    const { dispatch_id, otp } = req.body as { dispatch_id: number; otp: string };
    if (!dispatch_id || !otp || !String(otp).trim()) return res.status(400).json({ error: 'Enter the OTP the customer gave you' });
    const dispatch = await getOne('SELECT * FROM dispatches WHERE id=$1', [dispatch_id]);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (dispatch.driver_id !== driverId) return res.status(403).json({ error: 'This delivery is not assigned to you' });
    if (dispatch.status !== 'dispatched') return res.status(400).json({ error: 'This delivery is not awaiting OTP confirmation' });

    await query(
      `UPDATE dispatches SET driver_submitted_otp=$1, driver_submitted_at=NOW() WHERE id=$2`,
      [String(otp).trim(), dispatch_id]
    );
    const driver = await getOne('SELECT name FROM drivers WHERE id=$1', [driverId]);
    await notifyEvent({
      dispatchId: dispatch_id,
      eventType: 'driver_otp_submitted',
      recipientRole: 'owner',
      message: `${driver?.name || 'Driver'} entered a delivery OTP for DSP-${1000 + dispatch_id} — review it on OTP Confirmations.`,
    });
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

export default router;
