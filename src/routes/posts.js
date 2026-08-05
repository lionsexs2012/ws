const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, postController.getPosts);
router.post('/', authMiddleware, postController.createPost);
router.delete('/:id', authMiddleware, postController.deletePost);
router.get('/user/:userId', authMiddleware, postController.getUserPosts);

module.exports = router;
