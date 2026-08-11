import { Router, type Request, type Response } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';
import pool from '../db/database';

const router = Router();

// A 'driver' user only ever sees/edits their own trips — enforced here, not
// just hidden in the UI, so the API can't be used to read other drivers' data.
function driverScope(req: Request, res: Response): number | null | undefined {
  if (req.user!.role !== 'driver') return undefined; // no forced scope
  if (!req.user!.linkedDriverId) {
    res.status(403).json({ error: 'Your account is not linked to a driver record — ask the owner to fix this in User Management.' });
    return null;
  }
  return req.user!.linkedDriverId;
}

router.get('/', async (req, res) => {
  try {
    const scope = driverScope(req, res);
    if (scope === null) return;
    const { vehicle_id, month, driver_id } = req.query as Record<string, string | undefined>;
    const clauses: string[] = [];
    const params: any[] = [];
    if (scope !== undefined) { params.push(scope); clauses.push(`t.driver_id=$${params.length}`); }
    else if (driver_id) { params.push(driver_id); clauses.push(`t.driver_id=$${params.length}`); }
    if (vehicle_id) { params.push(vehicle_id); clauses.push(`t.vehicle_id=$${params.length}`); }
    if (month) { params.push(month); clauses.push(`to_char(t.date::date,'YYYY-MM')=$${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await getAll(`
      SELECT t.*, v.vehicle_number, dr.name as driver_name, p.name as product_name, p.unit,
        COALESCE((SELECT SUM(amount) FROM vehicle_trip_expenses WHERE trip_id=t.id),0) as total_expense,
        COALESCE((SELECT SUM(quantity) FROM vehicle_trip_unloading_points WHERE trip_id=t.id),0) as total_unloaded
      FROM vehicle_trips t
      JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN drivers dr ON dr.id = t.driver_id
      LEFT JOIN products p ON p.id = t.product_id
      ${where}
      ORDER BY t.date DESC, t.id DESC
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.get('/:id', async (req, res) => {
  try {
    const trip = await getOne(`
      SELECT t.*, v.vehicle_number, dr.name as driver_name, p.name as product_name, p.unit
      FROM vehicle_trips t
      JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN drivers dr ON dr.id = t.driver_id
      LEFT JOIN products p ON p.id = t.product_id
      WHERE t.id=$1
    `, [req.params.id]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (req.user!.role === 'driver' && trip.driver_id !== req.user!.linkedDriverId) {
      return res.status(403).json({ error: 'Not your trip' });
    }
    const expenses = await getAll('SELECT * FROM vehicle_trip_expenses WHERE trip_id=$1 ORDER BY id', [req.params.id]);
    const unloadingPoints = await getAll('SELECT * FROM vehicle_trip_unloading_points WHERE trip_id=$1 ORDER BY id', [req.params.id]);
    res.json({ ...trip, expenses, unloading_points: unloadingPoints });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

interface ExpenseInput { description: string; amount: number }
interface UnloadingInput { location_name: string; quantity: number }

router.post('/', async (req, res) => {
  const { date, vehicle_id, driver_id, advance_amount, product_id, quantity, remarks, expenses, unloading_points } = req.body as {
    date: string; vehicle_id: number; driver_id?: number; advance_amount?: number; product_id?: number; quantity?: number;
    remarks?: string; expenses?: ExpenseInput[]; unloading_points?: UnloadingInput[];
  };
  const scope = driverScope(req, res);
  if (scope === null) return;
  const effectiveDriverId = scope !== undefined ? scope : (driver_id || null);
  const client = await pool.connect();
  try {
    if (!date || !vehicle_id) return res.status(400).json({ error: 'date and vehicle_id are required' });
    await client.query('BEGIN');
    const trip = (await client.query(
      `INSERT INTO vehicle_trips (date, vehicle_id, driver_id, advance_amount, product_id, quantity, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [date, vehicle_id, effectiveDriverId, advance_amount || 0, product_id || null, quantity || 0, remarks || null]
    )).rows[0];
    for (const ex of (expenses || []).filter((e) => e.description?.trim() && Number(e.amount) > 0)) {
      await client.query('INSERT INTO vehicle_trip_expenses (trip_id, description, amount) VALUES ($1,$2,$3)', [trip.id, ex.description.trim(), ex.amount]);
    }
    for (const up of (unloading_points || []).filter((u) => u.location_name?.trim() && Number(u.quantity) > 0)) {
      await client.query('INSERT INTO vehicle_trip_unloading_points (trip_id, location_name, quantity) VALUES ($1,$2,$3)', [trip.id, up.location_name.trim(), up.quantity]);
    }
    await client.query('COMMIT');
    res.json(trip);
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: friendlyError(e) });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const { date, vehicle_id, driver_id, advance_amount, product_id, quantity, remarks, expenses, unloading_points } = req.body as {
    date: string; vehicle_id: number; driver_id?: number; advance_amount?: number; product_id?: number; quantity?: number;
    remarks?: string; expenses?: ExpenseInput[]; unloading_points?: UnloadingInput[];
  };
  const client = await pool.connect();
  try {
    if (req.user!.role === 'driver') {
      const existing = await getOne('SELECT driver_id FROM vehicle_trips WHERE id=$1', [req.params.id]);
      if (!existing || existing.driver_id !== req.user!.linkedDriverId) {
        client.release();
        return res.status(403).json({ error: 'Not your trip' });
      }
    }
    const effectiveDriverId = req.user!.role === 'driver' ? req.user!.linkedDriverId : (driver_id || null);
    await client.query('BEGIN');
    const trip = (await client.query(
      `UPDATE vehicle_trips SET date=$1, vehicle_id=$2, driver_id=$3, advance_amount=$4, product_id=$5, quantity=$6, remarks=$7
       WHERE id=$8 RETURNING *`,
      [date, vehicle_id, effectiveDriverId, advance_amount || 0, product_id || null, quantity || 0, remarks || null, req.params.id]
    )).rows[0];
    if (!trip) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Trip not found' }); }
    await client.query('DELETE FROM vehicle_trip_expenses WHERE trip_id=$1', [trip.id]);
    await client.query('DELETE FROM vehicle_trip_unloading_points WHERE trip_id=$1', [trip.id]);
    for (const ex of (expenses || []).filter((e) => e.description?.trim() && Number(e.amount) > 0)) {
      await client.query('INSERT INTO vehicle_trip_expenses (trip_id, description, amount) VALUES ($1,$2,$3)', [trip.id, ex.description.trim(), ex.amount]);
    }
    for (const up of (unloading_points || []).filter((u) => u.location_name?.trim() && Number(u.quantity) > 0)) {
      await client.query('INSERT INTO vehicle_trip_unloading_points (trip_id, location_name, quantity) VALUES ($1,$2,$3)', [trip.id, up.location_name.trim(), up.quantity]);
    }
    await client.query('COMMIT');
    res.json(trip);
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: friendlyError(e) });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.user!.role === 'driver') {
      const existing = await getOne('SELECT driver_id FROM vehicle_trips WHERE id=$1', [req.params.id]);
      if (!existing || existing.driver_id !== req.user!.linkedDriverId) {
        return res.status(403).json({ error: 'Not your trip' });
      }
    }
    await query('DELETE FROM vehicle_trips WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
