const Friend = require('../models/Friend');
const User = require('../models/User');
const { sendToUser } = require('../websocket');
const { cache } = require('../config/redis');
const winston = require('winston');

const getFriends = async (req, res) => {
    try {
        const friends = await Friend.getFriends(req.userId);
        res.json({ friends });
        
    } catch (err) {
        winston.error('Get friends error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const getRequests = async (req, res) => {
    try {
        const requests = await Friend.getRequests(req.userId);
        res.json({ requests });
        
    } catch (err) {
        winston.error('Get friend requests error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const sendRequest = async (req, res) => {
    try {
        const { targetId } = req.body;
        
        if (targetId === req.userId) {
            return res.status(400).json({ error: 'Нельзя добавить себя' });
        }
        
        const target = await User.findById(targetId);
        if (!target) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const areFriends = await Friend.areFriends(req.userId, targetId);
        if (areFriends) {
            return res.status(400).json({ error: 'Уже в друзьях' });
        }
        
        const hasPending = await Friend.hasPendingRequest(req.userId, targetId);
        if (hasPending) {
            return res.status(400).json({ error: 'Заявка уже отправлена' });
        }
        
        await Friend.sendRequest(req.userId, targetId);
        
        // Уведомление
        const user = await User.findById(req.userId);
        sendToUser(targetId, {
            type: 'friend_request',
            from: req.userId,
            fromLogin: user ? user.login : 'Unknown'
        });
        
        await cache.del('users:all');
        
        res.json({ success: true });
        
    } catch (err) {
        winston.error('Send friend request error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const acceptRequest = async (req, res) => {
    try {
        const { requestId } = req.body;
        
        const result = await Friend.acceptRequest(requestId, req.userId);
        if (!result) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        // Уведомление
        const user = await User.findById(req.userId);
        sendToUser(result.user_id, {
            type: 'friend_accepted',
            from: req.userId,
            fromLogin: user ? user.login : 'Unknown'
        });
        
        await cache.del('users:all');
        
        res.json({ success: true });
        
    } catch (err) {
        winston.error('Accept friend error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const rejectRequest = async (req, res) => {
    try {
        const { requestId } = req.body;
        await Friend.rejectRequest(requestId, req.userId);
        res.json({ success: true });
        
    } catch (err) {
        winston.error('Reject friend error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const removeFriend = async (req, res) => {
    try {
        const { friendId } = req.body;
        await Friend.removeFriend(req.userId, friendId);
        await cache.del('users:all');
        res.json({ success: true });
        
    } catch (err) {
        winston.error('Remove friend error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

module.exports = {
    getFriends,
    getRequests,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend
};
