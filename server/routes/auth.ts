import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getOne, getAll, query } from '../db/database';
import { authMiddleware, JWT_SECRET } from '../middleware/auth';
import { friendlyError } from '../lib/userError';

const router = Router();

// Page-level permissions the owner can grant per user. Dashboard is always
// visible; User Management stays owner-only regardless of grants. The
// 'driver' role doesn't use this matrix at all — it gets automatic,
// hardcoded access to its own My Ledger page only (see App.tsx / Sidebar.tsx).
export const ALL_PERMISSIONS = [
  'orders', 'purchases', 'dispatch', 'sales_analytics', 'gate', 'otp', 'stock', 'rail_rack',
  'vehicle_ledger', 'payments', 'customers', 'masters', 'reports',
];

// Sensible starting grant when a new user is created with a given role —
// the owner can still add/remove individual permissions afterwards.
// OTP is exclusive to godown_manager (+ owner, who always has everything) —
// gatekeepers are a physical-gate-security role and don't need delivery OTPs.
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  owner: ALL_PERMISSIONS,
  accountant: ['orders', 'purchases', 'dispatch', 'sales_analytics', 'otp', 'stock', 'rail_rack', 'vehicle_ledger', 'payments', 'customers', 'masters', 'reports'],
  godown_manager: ['gate', 'otp', 'stock', 'rail_rack', 'vehicle_ledger'],
  gatekeeper: ['gate', 'orders', 'dispatch'],
  collection_staff: ['payments', 'customers'],
  driver: [],
};

async function getUserPermissions(userId: number, role: string): Promise<string[]> {
  if (role === 'owner') return ALL_PERMISSIONS;
  const rows = await getAll('SELECT permission_name FROM user_permissions WHERE user_id = $1', [userId]);
  return rows.map((r: any) => r.permission_name);
}

function signToken(user: { id: number; username: string; role: string; linked_driver_id?: number | null; linked_location_id?: number | null }) {
  return jwt.sign(
    {
      userId: user.id, username: user.username, role: user.role,
      linkedDriverId: user.linked_driver_id ?? null,
      linkedLocationId: user.linked_location_id ?? null,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/login — no auth required
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getOne('SELECT * FROM users WHERE username = $1 AND is_active = 1', [username]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const permissions = await getUserPermissions(user.id, user.role);
    res.json({
      token: signToken(user),
      user: {
        id: user.id, username: user.username, role: user.role, display_name: user.display_name,
        linked_driver_id: user.linked_driver_id, linked_location_id: user.linked_location_id,
      },
      permissions,
    });
  } catch (e: any) {
    res.status(500).json({ error: friendlyError(e) });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await getOne('SELECT id, username, role, display_name, linked_driver_id, linked_location_id FROM users WHERE id = $1', [req.user!.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const permissions = await getUserPermissions(user.id, user.role);
    res.json({ user, permissions });
  } catch (e: any) {
    res.status(500).json({ error: friendlyError(e) });
  }
});

// GET /api/auth/users — owner only
router.get('/users', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const users = await getAll(`
      SELECT u.id, u.username, u.role, u.display_name, u.is_active, u.created_at,
        u.linked_driver_id, d.name as driver_name,
        u.linked_location_id, l.name as location_name,
        COALESCE(ARRAY_AGG(up.permission_name) FILTER (WHERE up.permission_name IS NOT NULL), '{}') AS permissions
      FROM users u
      LEFT JOIN user_permissions up ON up.user_id = u.id
      LEFT JOIN drivers d ON d.id = u.linked_driver_id
      LEFT JOIN locations l ON l.id = u.linked_location_id
      GROUP BY u.id, d.name, l.name
      ORDER BY u.id
    `);
    res.json(users);
  } catch (e: any) {
    res.status(500).json({ error: friendlyError(e) });
  }
});

// POST /api/auth/users — owner create user (seeded with the role's default permissions).
// role='driver' either links an existing `drivers` row (driver_id) or auto-creates one
// from display_name, so every driver login always has somewhere to log trips against.
router.post('/users', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { username, password, display_name, role, driver_id, location_id } = req.body;
    if (!username || !password || !display_name || !role) {
      return res.status(400).json({ error: 'username, password, display_name, role are required' });
    }
    const hash = await bcrypt.hash(password, 10);

    let linkedDriverId: number | null = null;
    if (role === 'driver') {
      if (driver_id) {
        linkedDriverId = Number(driver_id);
      } else {
        const newDriver = await getOne('INSERT INTO drivers (name) VALUES ($1) RETURNING id', [display_name]);
        linkedDriverId = newDriver.id;
      }
    }
    const linkedLocationId = (role === 'gatekeeper' || role === 'godown_manager') && location_id ? Number(location_id) : null;

    const result = await getOne(
      'INSERT INTO users (username, password_hash, role, display_name, linked_driver_id, linked_location_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, role, display_name, linked_driver_id, linked_location_id, created_at',
      [username, hash, role, display_name, linkedDriverId, linkedLocationId]
    );
    const defaults = DEFAULT_PERMISSIONS[role] || [];
    if (defaults.length && role !== 'owner') {
      await query(
        'INSERT INTO user_permissions (user_id, permission_name) SELECT $1, UNNEST($2::text[])',
        [result.id, defaults]
      );
    }
    res.json({ ...result, permissions: role === 'owner' ? ALL_PERMISSIONS : defaults });
  } catch (e: any) {
    res.status(400).json({ error: friendlyError(e, 'Could not create user') });
  }
});

// PUT /api/auth/users/:id — owner update role/active/display_name/linked driver
router.put('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { display_name, role, is_active, driver_id, location_id } = req.body;
    const row = await getOne(
      `UPDATE users SET display_name=COALESCE($1,display_name), role=COALESCE($2,role), is_active=COALESCE($3,is_active),
        linked_driver_id=COALESCE($4,linked_driver_id), linked_location_id=COALESCE($5,linked_location_id)
       WHERE id=$6 RETURNING id, username, role, display_name, is_active, linked_driver_id, linked_location_id`,
      [display_name ?? null, role ?? null, is_active ?? null, driver_id ?? null, location_id ? Number(location_id) : null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  } catch (e: any) {
    res.status(400).json({ error: friendlyError(e) });
  }
});

// PUT /api/auth/users/:id/permissions — owner grants/revokes page access
router.put('/users/:id/permissions', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const id = parseInt(String(req.params.id));
    const { permissions } = req.body as { permissions: string[] };
    const clean = (permissions || []).filter((p) => ALL_PERMISSIONS.includes(p));
    await query('DELETE FROM user_permissions WHERE user_id = $1', [id]);
    if (clean.length > 0) {
      await query(
        'INSERT INTO user_permissions (user_id, permission_name) SELECT $1, UNNEST($2::text[])',
        [id, clean]
      );
    }
    res.json({ success: true, permissions: clean });
  } catch (e: any) {
    res.status(500).json({ error: friendlyError(e) });
  }
});

// POST /api/auth/users/:id/reset-password — owner resets a user's password
router.post('/users/:id/reset-password', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: friendlyError(e) });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const id = parseInt(String(req.params.id));
    if (id === req.user!.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: friendlyError(e) });
  }
});

export default router;
