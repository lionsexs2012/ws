const User = require('../models/User');
const { cache } = require('../config/redis');
const winston = require('winston');

const getUsers = async (req, res) => {
    try {
        let users = await cache.get('users:all');
        
        if (!users) {
            users = await User.getAll(req.userId);
            await cache.set('users:all', users, 60);
        }
        
        res.json({ users });
        
    } catch (err) {
        winston.error('Get users error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json({ user });
        
    } catch (err) {
        winston.error('Get user error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { bio } = req.body;
        
        const user = await User.updateBio(req.userId, bio);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        await cache.del('users:all');
        
        res.json({ user });
        
    } catch (err) {
        winston.error('Update profile error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const searchUsers = async (req, res) => {
    try {
        const users = await User.search(req.params.query, req.userId);
        res.json({ users });
        
    } catch (err) {
        winston.error('Search users error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

module.exports = {
    getUsers,
    getUserById,
    updateProfile,
    searchUsers
};
