import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';
import { notifyEvent, generateOtp } from '../lib/notify';
import { getAvailableStock } from './stock';
import { sendWhatsAppMessage, dispatchOtpMessage } from '../lib/whatsapp';
import { sendTrialVerificationSms } from '../lib/sms';

const router = Router();

// OTP is exclusive to godown_manager (+ owner) per the client's explicit
// rule — strip it from every dispatch row before it leaves the server,
// not just at the one screen gated behind the 'otp' permission. A page-level
// permission only controls which screens a role can open; it doesn't stop
// otp_code riding along in a 'dispatch'/'gate'-gated list/fulfill response.
function maskOtp<T extends Record<string, any>>(row: T | null | undefined, req: { user?: { role?: string } }): T | null | undefined {
  if (!row) return row;
  if (req.user?.role === 'owner' || req.user?.role === 'godown_manager') return row;
  const { otp_code, driver_submitted_otp, ...rest } = row;
  return rest as T;
}

const LIST_SELECT = `
  SELECT d.*, ('DSP-' || (1000 + d.id)) as dispatch_number,
    p.name as party_name, p.phone as party_phone,
    pr.name as product_name, pr.unit as product_unit,
    sl.name as source_location_name, dl.name as destination_location_name,
    v.vehicle_number, dr.name as driver_name_master
  FROM dispatches d
  JOIN products pr ON pr.id = d.product_id
  LEFT JOIN parties p ON p.id = d.party_id
  LEFT JOIN locations sl ON sl.id = d.source_location_id
  LEFT JOIN locations dl ON dl.id = d.destination_location_id
  LEFT JOIN vehicles v ON v.id = d.vehicle_id
  LEFT JOIN drivers dr ON dr.id = d.driver_id
`;

router.get('/', async (req, res) => {
  try {
    const { status, kind, party_id, product_id, driver_id } = req.query as Record<string, string | undefined>;
    const clauses: string[] = [];
    const params: any[] = [];
    if (status) { params.push(status); clauses.push(`d.status=$${params.length}`); }
    if (kind) { params.push(kind); clauses.push(`d.kind=$${params.length}`); }
    if (party_id) { params.push(party_id); clauses.push(`d.party_id=$${params.length}`); }
    if (product_id) { params.push(product_id); clauses.push(`d.product_id=$${params.length}`); }
    if (driver_id) { params.push(driver_id); clauses.push(`d.driver_id=$${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await getAll(`${LIST_SELECT} ${where} ORDER BY d.created_at DESC, d.id DESC`, params);
    res.json(rows.map((r: any) => maskOtp(r, req)));
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await getOne(`${LIST_SELECT} WHERE d.id=$1`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Dispatch not found' });
    res.json(maskOtp(row, req));
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// POST /punch — office punches an order (replaces typing it into the WhatsApp group).
// No stock is moved yet; this just queues the order and alerts the godown/gate.
router.post('/punch', async (req, res) => {
  const {
    date, kind, party_id, product_id, quantity, rate,
    source_location_id, destination_type, destination_location_id, destination_address,
    payment_type, credit_days, expected_delivery_date, remarks, source_purchase_id,
  } = req.body;
  try {
    if (!date || !product_id || !quantity) {
      return res.status(400).json({ error: 'date, product_id, quantity are required' });
    }
    if ((kind || 'sale') === 'sale' && !party_id) {
      return res.status(400).json({ error: 'party_id is required for a sale dispatch' });
    }
    if (source_purchase_id) {
      const lot = await getOne(
        `SELECT quantity - COALESCE((SELECT SUM(d.quantity) FROM dispatches d WHERE d.source_purchase_id=$1 AND d.status != 'cancelled'),0) as available
         FROM purchases WHERE id=$1`,
        [source_purchase_id]
      );
      if (!lot || Number(lot.available) < Number(quantity)) {
        return res.status(400).json({ error: `That purchase lot only has ${lot?.available ?? 0} available` });
      }
    }
    const row = await getOne(
      `INSERT INTO dispatches (
        date, kind, party_id, product_id, quantity, rate, source_location_id,
        destination_type, destination_location_id, destination_address,
        payment_type, credit_days, expected_delivery_date, status, punched_by, remarks, source_purchase_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'punched',$14,$15,$16) RETURNING *`,
      [
        date, kind || 'sale', party_id || null, product_id, quantity, rate || 0, source_location_id || null,
        destination_type || 'customer_site', destination_location_id || null, destination_address || null,
        payment_type || 'cash', credit_days || null, expected_delivery_date || null, req.user!.id, remarks || null,
        source_purchase_id || null,
      ]
    );
    const product = await getOne('SELECT name, unit FROM products WHERE id=$1', [product_id]);
    const party = party_id ? await getOne('SELECT name FROM parties WHERE id=$1', [party_id]) : null;
    await notifyEvent({
      dispatchId: row.id,
      eventType: 'order_punched',
      recipientRole: 'godown_manager',
      message: `New order punched: ${quantity} ${product?.unit || ''} ${product?.name || ''}${party ? ' for ' + party.name : ''} — DSP-${1000 + row.id}. Please load and dispatch.`,
    });
    res.json(maskOtp(row, req));
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

// POST /:id/fulfill — godown/gate confirms load-out: fills the real vehicle/driver,
// checks stock, generates the OTP the customer/driver must read back.
router.post('/:id/fulfill', async (req, res) => {
  const { vehicle_id, driver_id, driver_name, driver_mobile, source_location_id } = req.body;
  try {
    const dispatch = await getOne('SELECT * FROM dispatches WHERE id=$1', [req.params.id]);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (dispatch.status !== 'punched') return res.status(400).json({ error: 'Only a punched order can be fulfilled' });

    const locationId = source_location_id || dispatch.source_location_id;
    if (!locationId) return res.status(400).json({ error: 'source_location_id is required' });

    const available = await getAvailableStock(locationId, dispatch.product_id);
    if (available < Number(dispatch.quantity)) {
      return res.status(400).json({ error: `Not enough stock at this location — available ${available}, needed ${dispatch.quantity}` });
    }

    const partyPhone = dispatch.party_id
      ? (await getOne('SELECT phone FROM parties WHERE id=$1', [dispatch.party_id]))?.phone
      : null;

    // Trial-account workaround (see server/lib/sms.ts): if configured, this
    // sends the real SMS first and hands back whatever code Twilio put in
    // it, so the stored otp_code always matches what the customer received.
    // Falls back to our own random code when SMS isn't sent/configured.
    const smsResult = await sendTrialVerificationSms(partyPhone);
    const otp = smsResult.code || generateOtp(4);

    const row = await getOne(
      `UPDATE dispatches SET
        source_location_id=$1, vehicle_id=$2, driver_id=$3, driver_name=$4, driver_mobile=$5,
        status='dispatched', otp_code=$6, otp_generated_at=NOW(), fulfilled_by=$7
       WHERE id=$8 RETURNING *`,
      [locationId, vehicle_id || null, driver_id || null, driver_name || null, driver_mobile || null, otp, req.user!.id, req.params.id]
    );

    const detail = await getOne(`${LIST_SELECT} WHERE d.id=$1`, [row.id]);
    const whatsappSent = await sendWhatsAppMessage(
      detail.party_phone,
      dispatchOtpMessage({
        dispatchNumber: detail.dispatch_number, partyName: detail.party_name, quantity: detail.quantity,
        unit: detail.product_unit, productName: detail.product_name, vehicleNumber: detail.vehicle_number, otpCode: otp,
      })
    );

    const sentVia = whatsappSent ? ' — sent to customer via WhatsApp.' : smsResult.sent ? ' — sent to customer via SMS.' : ' — share with the customer/driver, enter it here once delivered.';
    await notifyEvent({
      dispatchId: row.id,
      eventType: 'otp_generated',
      recipientRole: 'owner',
      message: `Dispatch DSP-${1000 + row.id} loaded out. OTP: ${otp}${sentVia}`,
    });
    res.json({ ...maskOtp(row, req), whatsapp_sent: whatsappSent, sms_sent: smsResult.sent });
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

// POST /:id/otp/verify — the delivery-confirmation step.
router.post('/:id/otp/verify', async (req, res) => {
  const { otp } = req.body;
  try {
    const dispatch = await getOne('SELECT * FROM dispatches WHERE id=$1', [req.params.id]);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (dispatch.status !== 'dispatched') return res.status(400).json({ error: 'This dispatch is not awaiting OTP confirmation' });
    if (!otp || String(otp).trim() !== String(dispatch.otp_code)) {
      return res.status(400).json({ error: 'Incorrect OTP' });
    }
    const row = await getOne(
      `UPDATE dispatches SET status='delivered', otp_verified_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    await notifyEvent({
      dispatchId: row.id,
      eventType: 'otp_verified',
      recipientRole: 'owner',
      message: `OTP verified — DSP-${1000 + row.id} delivery completed.`,
    });
    res.json(maskOtp(row, req));
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

// PATCH /:id/otp/discard-driver-entry — owner rejects a driver-submitted OTP
// that didn't match (e.g. driver mis-heard/mistyped it), clearing it so the
// driver can re-enter. Never touches the real otp_code or dispatch status.
router.patch('/:id/otp/discard-driver-entry', async (req, res) => {
  try {
    if (req.user!.role === 'driver') return res.status(403).json({ error: 'Not permitted' });
    const row = await getOne(
      `UPDATE dispatches SET driver_submitted_otp=NULL, driver_submitted_at=NULL WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Dispatch not found' });
    res.json(maskOtp(row, req));
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

// Gatekeepers can punch, view and load dispatches but not remove them —
// a structural role restriction, independent of whatever page permissions
// they've been granted.
router.patch('/:id/cancel', async (req, res) => {
  if (req.user!.role === 'gatekeeper') return res.status(403).json({ error: 'Gatekeepers cannot cancel dispatches' });
  try {
    const dispatch = await getOne('SELECT * FROM dispatches WHERE id=$1', [req.params.id]);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (dispatch.status === 'delivered') return res.status(400).json({ error: 'Cannot cancel a delivered dispatch' });
    const row = await getOne(`UPDATE dispatches SET status='cancelled' WHERE id=$1 RETURNING *`, [req.params.id]);
    res.json(maskOtp(row, req));
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { date, product_id, quantity, rate, destination_type, destination_location_id, destination_address, payment_type, credit_days, expected_delivery_date, remarks } = req.body;
  try {
    const dispatch = await getOne('SELECT * FROM dispatches WHERE id=$1', [req.params.id]);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (dispatch.status !== 'punched') return res.status(400).json({ error: 'Only a punched (not yet loaded) order can be edited' });
    const row = await getOne(
      `UPDATE dispatches SET date=$1, product_id=$2, quantity=$3, rate=$4, destination_type=$5, destination_location_id=$6,
        destination_address=$7, payment_type=$8, credit_days=$9, expected_delivery_date=$10, remarks=$11
       WHERE id=$12 RETURNING *`,
      [date, product_id, quantity, rate || 0, destination_type, destination_location_id || null, destination_address || null,
       payment_type, credit_days || null, expected_delivery_date || null, remarks || null, req.params.id]
    );
    res.json(maskOtp(row, req));
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  if (req.user!.role === 'gatekeeper') return res.status(403).json({ error: 'Gatekeepers cannot delete dispatches' });
  try {
    const dispatch = await getOne('SELECT status FROM dispatches WHERE id=$1', [req.params.id]);
    if (dispatch && dispatch.status !== 'punched') {
      return res.status(400).json({ error: 'Only a punched order can be deleted — cancel it instead' });
    }
    await query('DELETE FROM dispatches WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
