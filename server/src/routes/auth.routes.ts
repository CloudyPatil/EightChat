import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many authentication attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

const credentialsValidation = [
  body('username')
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9_]{3,30}$/)
    .withMessage('Username must be 3-30 lowercase letters, numbers, or underscores'),
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters'),
];

router.post('/register', authLimiter, credentialsValidation, validateRequest, AuthController.register);
router.post('/login', authLimiter, credentialsValidation, validateRequest, AuthController.login);
router.post('/refresh', authLimiter, AuthController.refreshToken);
router.post('/logout', authenticate, AuthController.logout);

export default router;
