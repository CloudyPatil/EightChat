import multer from 'multer';
import { Router } from 'express';
import { param } from 'express-validator';
import { UploadsController } from '../controllers/uploads.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype.startsWith('image/')),
});
const router = Router();

router.post(
  '/:conversationId/images',
  authenticate,
  param('conversationId').isUUID().withMessage('Conversation id must be valid'),
  validateRequest,
  upload.single('image'),
  UploadsController.uploadImage
);

export default router;
