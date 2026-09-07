import { Router } from 'express';
import { body, param } from 'express-validator';
import { ConversationsController } from '../controllers/conversations.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';

const router = Router();

router.use(authenticate);

router.get('/', ConversationsController.list);
router.post(
  '/direct',
  body('recipient_username')
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9_]{3,30}$/)
    .withMessage('Recipient username must be 3-30 lowercase letters, numbers, or underscores'),
  validateRequest,
  ConversationsController.createDirect
);
router.get(
  '/:id',
  param('id').isUUID().withMessage('Conversation id must be valid'),
  validateRequest,
  ConversationsController.getById
);

export default router;
