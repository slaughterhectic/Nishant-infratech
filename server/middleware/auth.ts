import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'nishant-infratech-dev-secret';

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; username: string; role: string; linkedDriverId?: number | null; linkedLocationId?: number | null };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as {
      userId: number; username: string; role: string; linkedDriverId?: number | null; linkedLocationId?: number | null;
    };
    req.user = {
      id: payload.userId, username: payload.username, role: payload.role,
      linkedDriverId: payload.linkedDriverId ?? null, linkedLocationId: payload.linkedLocationId ?? null,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Phase-1 RBAC: a plain role check, no per-module permission matrix yet.
// 'owner' always passes, mirroring cementbook's 'admin' bypass.
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (req.user.role === 'owner' || roles.includes(req.user.role)) { next(); return; }
    res.status(403).json({ error: 'Permission denied' });
  };
}

export { JWT_SECRET };
