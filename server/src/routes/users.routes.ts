import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { UsersController } from '../controllers/users.controller';

const router = Router();

router.get('/', authenticate, UsersController.search);

export default router;
