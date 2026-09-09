import { Router } from 'express';
import { signup, signin, getMe } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router: Router = Router();

router.post('/signup', signup);
router.post('/signin', signin);
router.post('/login', signin); // alias for convenience
router.get('/me', authenticate, getMe);

export default router;
