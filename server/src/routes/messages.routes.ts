import { Router } from 'express';
import { body, param } from 'express-validator';
import { MessagesController } from '../controllers/messages.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';

const router = Router();

router.get(
  '/:conversationId/messages',
  authenticate,
  param('conversationId').isUUID().withMessage('Conversation id must be valid'),
  validateRequest,
  MessagesController.list
);
router.delete(
  '/messages/:messageId', authenticate,
  param('messageId').isUUID(), body('scope').isIn(['me', 'everyone']), validateRequest, MessagesController.delete
);
router.delete(
  '/:conversationId/messages', authenticate,
  param('conversationId').isUUID(), validateRequest, MessagesController.clear
);

export default router;
