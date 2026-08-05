const User = require('../models/User');
const { comparePassword, generateToken } = require('../config/auth');
const { sendVerificationEmail, sendWelcomeEmail } = require('../config/email');
const winston = require('winston');

const register = async (req, res) => {
    try {
        const { login, email, password } = req.body;
        
        // Валидация
        if (!login || !email || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль минимум 6 символов' });
        }
        if (!email.includes('@')) {
            return res.status(400).json({ error: 'Некорректный email' });
        }
        
        // Проверка существования
        const existing = await User.findByLogin(login);
        if (existing) {
            if (existing.login === login) {
                return res.status(400).json({ error: 'Логин уже занят' });
            }
            if (existing.email === email) {
                return res.status(400).json({ error: 'Email уже зарегистрирован' });
            }
        }
        
        const user = await User.create(login, email, password);
        await sendVerificationEmail(email, user.verification_code);
        
        const token = generateToken(user.id, user.login, user.email);
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                login: user.login,
                email: user.email,
                verified: user.verified,
                bio: user.bio
            }
        });
        
        winston.info(`✅ Зарегистрирован: ${login} (${email})`);
        
    } catch (err) {
        winston.error('Register error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const login = async (req, res) => {
    try {
        const { login, password } = req.body;
        
        if (!login || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }
        
        const user = await User.findByLogin(login);
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        await User.setOnline(user.id, true);
        
        const token = generateToken(user.id, user.login, user.email);
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                login: user.login,
                email: user.email,
                verified: user.verified,
                bio: user.bio
            }
        });
        
        winston.info(`✅ Вход: ${user.login}`);
        
    } catch (err) {
        winston.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.userId;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        if (user.verified) {
            return res.json({ success: true, message: 'Email уже подтверждён' });
        }
        
        const userWithCode = await User.findByLogin(user.login);
        if (userWithCode && userWithCode.verification_code === code) {
            const updated = await User.verifyEmail(userId);
            await sendWelcomeEmail(user.email, user.login);
            
            res.json({ success: true });
            winston.info(`✅ Email подтверждён: ${user.email}`);
        } else {
            res.status(400).json({ error: 'Неверный код' });
        }
        
    } catch (err) {
        winston.error('Verify error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const resendCode = async (req, res) => {
    try {
        const userId = req.userId;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        if (user.verified) {
            return res.json({ success: true, message: 'Email уже подтверждён' });
        }
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await User.updateVerification(userId, code);
        await sendVerificationEmail(user.email, code);
        
        res.json({ success: true });
        winston.info(`📧 Код отправлен повторно: ${user.email}`);
        
    } catch (err) {
        winston.error('Resend error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const verifyToken = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json({
            valid: true,
            user: {
                id: user.id,
                login: user.login,
                email: user.email,
                verified: user.verified,
                bio: user.bio
            }
        });
        
    } catch (err) {
        winston.error('Verify token error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

module.exports = {
    register,
    login,
    verifyEmail,
    resendCode,
    verifyToken
};
