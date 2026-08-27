import type { AuthUser } from '../middleware/authToken.js';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      user?: AuthUser;
    }
  }
}

export {};
