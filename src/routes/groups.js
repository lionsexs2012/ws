const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, groupController.getGroups);
router.post('/', authMiddleware, groupController.createGroup);
router.post('/:id/join', authMiddleware, groupController.joinGroup);
router.post('/:id/leave', authMiddleware, groupController.leaveGroup);
router.delete('/:id', authMiddleware, groupController.deleteGroup);

module.exports = router;
