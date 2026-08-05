const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/auth');

router.get('/unread/count', authMiddleware, messageController.getUnreadCount);
router.get('/:userId', authMiddleware, messageController.getMessages);
router.post('/:userId', authMiddleware, messageController.sendMessage);

module.exports = router;
