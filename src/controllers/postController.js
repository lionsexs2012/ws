const Post = require('../models/Post');
const User = require('../models/User');
const { cache } = require('../config/redis');
const winston = require('winston');

const getPosts = async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const posts = await Post.findAll(limit, offset);
        
        // Добавляем автора к постам
        for (const post of posts) {
            const author = await User.findById(post.author_id);
            post.author = author ? author.login : 'Unknown';
        }
        
        res.json({ posts });
        
    } catch (err) {
        winston.error('Get posts error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const createPost = async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Текст поста обязателен' });
        }
        if (text.length > 5000) {
            return res.status(400).json({ error: 'Максимум 5000 символов' });
        }
        
        const post = await Post.create(req.userId, text);
        const author = await User.findById(req.userId);
        post.author = author ? author.login : 'Unknown';
        
        await cache.delPattern('posts:*');
        
        res.json({ success: true, post });
        
    } catch (err) {
        winston.error('Create post error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const deletePost = async (req, res) => {
    try {
        const deleted = await Post.delete(req.params.id, req.userId);
        
        if (!deleted) {
            return res.status(404).json({ error: 'Пост не найден' });
        }
        
        await cache.delPattern('posts:*');
        
        res.json({ success: true });
        
    } catch (err) {
        winston.error('Delete post error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const getUserPosts = async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const posts = await Post.findByUser(req.params.userId, limit, offset);
        
        for (const post of posts) {
            const author = await User.findById(post.author_id);
            post.author = author ? author.login : 'Unknown';
        }
        
        res.json({ posts });
        
    } catch (err) {
        winston.error('Get user posts error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

module.exports = {
    getPosts,
    createPost,
    deletePost,
    getUserPosts
};
