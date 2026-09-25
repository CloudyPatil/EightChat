// server/src/routes/profile.routes.ts
import multer from 'multer';
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { ProfileController } from '../controllers/profile.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype.startsWith('image/')),
});

const router = Router();

router.get('/me', authenticate, ProfileController.getMe);
router.patch('/me', authenticate, ProfileController.updateProfile);
router.post('/me/avatar', authenticate, upload.single('avatar'), ProfileController.uploadAvatar);
router.delete('/me', authenticate, ProfileController.deleteAccount);

export default router;
