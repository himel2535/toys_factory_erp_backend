import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { apiPathToSectionId } from '../config/apiSectionMap.js';
import { userCanAccessSection, type SectionId } from '../config/sectionAccess.js';
import type { AuthUser } from './authToken.js';

/** Global path-based section gate — mirrors frontend section access. */
export function requireSectionAccess(req: Request, _res: Response, next: NextFunction) {
  const sectionId = apiPathToSectionId(req.path);
  if (!sectionId) {
    return next();
  }

  const user = (req as Request & { user?: AuthUser }).user;
  if (!userCanAccessSection(user, sectionId)) {
    return next(new ApiError(403, 'Forbidden: Section access required'));
  }

  next();
}

/** Explicit section gate for individual route groups. */
export function requireSection(sectionId: SectionId) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: AuthUser }).user;
    if (!userCanAccessSection(user, sectionId)) {
      return next(new ApiError(403, 'Forbidden: Section access required'));
    }
    next();
  };
}
