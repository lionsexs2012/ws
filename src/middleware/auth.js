const { verifyToken } = require('../config/auth');
const { query } = require('../config/database');
const winston = require('winston');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: 'Недействительный токен' });
        }

        const result = await query(
            'SELECT id, login, email, verified, bio FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        req.user = result.rows[0];
        req.userId = decoded.userId;
        req.userLogin = decoded.login;
        
        next();
    } catch (err) {
        winston.error('Auth error:', err);
        return res.status(500).json({ error: 'Ошибка авторизации' });
    }
};

const requireVerified = (req, res, next) => {
    if (!req.user.verified) {
        return res.status(403).json({ error: 'Подтвердите email' });
    }
    next();
};

module.exports = { authMiddleware, requireVerified };
