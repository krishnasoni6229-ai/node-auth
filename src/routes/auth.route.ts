import { Router } from 'express';
import {
  signup,
  signin,
  refreshToken,
  logout,
  logoutAll,
  getMe,
  getSessions,
  changePassword,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  signupSchema,
  signinSchema,
  refreshTokenSchema,
  changePasswordSchema,
} from '../validations/auth.validation.js';

const router: Router = Router();

// Public Authentication Endpoints
router.post('/signup', validate(signupSchema), signup);
router.post('/signin', validate(signinSchema), signin);
router.post('/login', validate(signinSchema), signin); // alias
router.post('/refresh', validate(refreshTokenSchema), refreshToken);
router.post('/logout', logout);

// Protected Endpoints (Requires Access Token)
router.get('/me', authenticate, getMe);
router.post('/me', authenticate, getMe);
router.get('/sessions', authenticate, getSessions);
router.post('/logout-all', authenticate, logoutAll);
router.post('/change-password', authenticate, validate(changePasswordSchema), changePassword);

export default router;
