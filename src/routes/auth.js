const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/verify', authMiddleware, authController.verifyEmail);
router.post('/resend', authMiddleware, authController.resendCode);
router.get('/verify-token', authMiddleware, authController.verifyToken);

module.exports = router;
