// server/src/routes/blocks.routes.ts
import { Router } from 'express';
import { param, body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { BlocksController } from '../controllers/blocks.controller';

const router = Router();

router.post(
  '/:id/block',
  authenticate,
  param('id').isUUID(),
  validateRequest,
  BlocksController.blockUser
);

router.delete(
  '/:id/block',
  authenticate,
  param('id').isUUID(),
  validateRequest,
  BlocksController.unblockUser
);

router.post(
  '/:id/report',
  authenticate,
  param('id').isUUID(),
  body('reason').optional().isString().isLength({ max: 200 }),
  validateRequest,
  BlocksController.reportUser
);

export default router;
