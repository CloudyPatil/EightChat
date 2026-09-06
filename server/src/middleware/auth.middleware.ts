// server/src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    const decoded = verifyAccessToken(token);

    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Invalid token attempt');
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
};

export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      req.user = verifyAccessToken(token);
    }
  } catch {
    // Optional - don't fail
  }
  next();
};