require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const winston = require('winston');

// Конфигурация
const { testConnection } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { testEmail } = require('./config/email');

// Middleware
const { authMiddleware } = require('./middleware/auth');
const { requestLogger } = require('./middleware/logger');
const { generalLimiter, authLimiter, apiLimiter } = require('./middleware/rateLimit');

// Роуты
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const friendRoutes = require('./routes/friends');

// WebSocket
const websocket = require('./websocket');

// ============================================================
//  EXPRESS APP
// ============================================================
const app = express();
const server = http.createServer(app);

// Безопасность
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
        },
    },
}));

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));

// Компрессия
app.use(compression());

// Логирование
app.use(requestLogger);

// Rate Limiting
app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Статика
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================
//  РОУТЫ
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/posts', authMiddleware, postRoutes);
app.use('/api/messages', authMiddleware, messageRoutes);
app.use('/api/groups', authMiddleware, groupRoutes);
app.use('/api/friends', authMiddleware, friendRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// Root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'Не найдено' });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    winston.error('Ошибка сервера:', err);
    res.status(500).json({ 
        error: 'Внутренняя ошибка сервера',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================================
//  WEBSOCKET
// ============================================================
websocket.init(server);

// ============================================================
//  ЗАПУСК
// ============================================================
const PORT = process.env.PORT || 3000;

const startServer = async () => {
    // Проверяем подключения
    const dbOk = await testConnection();
    const redisOk = await connectRedis();
    const emailOk = await testEmail();

    if (!dbOk) {
        winston.error('❌ Критическая ошибка: PostgreSQL не доступен');
        process.exit(1);
    }

    if (!redisOk) {
        winston.warn('⚠️ Redis не доступен. Кеширование отключено.');
    }

    server.listen(PORT, () => {
        winston.info(`
╔════════════════════════════════════════════════════════╗
║        🚀 WOND — ПРОДАКШН СЕРВЕР                     ║
║                                                        ║
║   📡 WebSocket: ws://localhost:${PORT}                  ║
║   🌐 HTTP:      http://localhost:${PORT}                ║
║                                                        ║
║   🔒 JWT + bcrypt шифрование                          ║
║   📧 Email: ${emailOk ? '✅' : '❌'}                     ║
║   📦 PostgreSQL: ${dbOk ? '✅' : '❌'}                   ║
║   🔴 Redis: ${redisOk ? '✅' : '❌'}                    ║
║                                                        ║
║   👨‍💼 CEO: LEV USKOV                                 ║
║   🌍 Среда: ${process.env.NODE_ENV || 'development'}  ║
║                                                        ║
║   ✅ Сервер запущен!                                   ║
╚════════════════════════════════════════════════════════╝
        `);
    });
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    winston.info('🛑 SIGTERM получен. Завершаем работу...');
    const { pool } = require('./config/database');
    await pool.end();
    server.close(() => {
        winston.info('✅ Сервер остановлен');
        process.exit(0);
    });
});

startServer();
