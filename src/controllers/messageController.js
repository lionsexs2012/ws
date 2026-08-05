const Message = require('../models/Message');
const User = require('../models/User');
const { sendToUser } = require('../websocket');
const winston = require('winston');

const getMessages = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        
        // Помечаем как прочитанные
        await Message.markAsRead(userId, req.userId);
        
        const messages = await Message.getConversation(
            req.userId,
            userId,
            limit,
            offset
        );
        
        res.json({ messages });
        
    } catch (err) {
        winston.error('Get messages error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const sendMessage = async (req, res) => {
    try {
        const { userId } = req.params;
        const { text } = req.body;
        
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Текст сообщения обязателен' });
        }
        if (text.length > 5000) {
            return res.status(400).json({ error: 'Максимум 5000 символов' });
        }
        
        const message = await Message.create(req.userId, userId, text);
        const user = await User.findById(req.userId);
        message.from_login = user ? user.login : 'Unknown';
        
        // Отправляем через WebSocket
        sendToUser(userId, {
            type: 'new_message',
            from: req.userId,
            fromLogin: user ? user.login : 'Unknown',
            message
        });
        
        res.json({ success: true, message });
        
    } catch (err) {
        winston.error('Send message error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const getUnreadCount = async (req, res) => {
    try {
        const count = await Message.getUnreadCount(req.userId);
        res.json({ unread: count });
        
    } catch (err) {
        winston.error('Get unread count error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

module.exports = {
    getMessages,
    sendMessage,
    getUnreadCount
};
