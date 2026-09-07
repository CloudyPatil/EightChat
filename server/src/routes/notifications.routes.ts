import { Router } from 'express';
import { body } from 'express-validator';
import { NotificationsController } from '../controllers/notifications.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';

const router = Router();
router.use(authenticate);

const tokenValidation = body('expo_push_token').isString().isLength({ min: 10, max: 255 });
router.post('/devices', tokenValidation, body('platform').isIn(['ios', 'android']), body('hide_message_preview').optional().isBoolean(), validateRequest, NotificationsController.registerDevice);
router.patch('/preferences', tokenValidation, body('notifications_enabled').isBoolean(), body('hide_message_preview').isBoolean(), validateRequest, NotificationsController.updatePreferences);

export default router;
