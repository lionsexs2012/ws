require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

// ============================================================
//  БАЗА ДАННЫХ
// ============================================================
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'wond_db',
    user: process.env.DB_USER || 'wond_user',
    password: process.env.DB_PASSWORD || 'wond_password',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============================================================
//  ПРИЛОЖЕНИЕ
// ============================================================
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const clients = new Map();

// ============================================================
//  АВТОРИЗАЦИЯ
// ============================================================
app.post('/api/register', async (req, res) => {
    try {
        const { login, email, password } = req.body;
        if (!login || !email || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }

        const existing = await pool.query(
            'SELECT * FROM users WHERE login = $1 OR email = $2',
            [login, email]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const userId = uuidv4();
        const hash = await bcrypt.hash(password, 10);
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        await pool.query(
            `INSERT INTO users (id, login, email, password_hash, verification_code)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, login, email, hash, code]
        );

        console.log(`📧 Код для ${email}: ${code}`);

        const token = jwt.sign({ userId, login, email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: { id: userId, login, email, verified: false }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        if (!login || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }

        const result = await pool.query(
            'SELECT * FROM users WHERE login = $1 OR email = $1',
            [login]
        );
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const token = jwt.sign(
            { userId: user.id, login: user.login, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                login: user.login,
                email: user.email,
                verified: user.verified || false,
                bio: user.bio || '🌟 Пользователь WOND'
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/verify', async (req, res) => {
    try {
        const { code } = req.body;
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        if (!token) return res.status(401).json({ error: 'Нет токена' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [decoded.userId]
        );
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

        if (user.verification_code === code) {
            await pool.query(
                'UPDATE users SET verified = TRUE, verification_code = NULL WHERE id = $1',
                [user.id]
            );
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Неверный код' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/verify-token', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        if (!token) return res.status(401).json({ error: 'Нет токена' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query(
            'SELECT id, login, email, verified, bio FROM users WHERE id = $1',
            [decoded.userId]
        );
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

        res.json({ valid: true, user });
    } catch (err) {
        res.status(401).json({ error: 'Недействительный токен' });
    }
});

// ============================================================
//  ПОЛЬЗОВАТЕЛИ
// ============================================================
app.get('/api/users', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        if (!token) return res.status(401).json({ error: 'Нет токена' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query(
            'SELECT id, login, email, bio, verified FROM users WHERE id != $1',
            [decoded.userId]
        );
        res.json({ users: result.rows });
    } catch (err) {
        res.status(401).json({ error: 'Недействительный токен' });
    }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, login, email, bio, verified FROM users WHERE id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json({ user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.put('/api/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const { bio } = req.body;
        const decoded = jwt.verify(token, JWT_SECRET);

        const result = await pool.query(
            'UPDATE users SET bio = $1 WHERE id = $2 RETURNING id, login, email, bio, verified',
            [bio, decoded.userId]
        );
        res.json({ user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============================================================
//  ПОСТЫ
// ============================================================
app.get('/api/posts', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.login as author
             FROM posts p
             JOIN users u ON p.author_id = u.id
             ORDER BY p.created_at DESC
             LIMIT 50`
        );
        res.json({ posts: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/posts', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст обязателен' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query(
            `INSERT INTO posts (author_id, text)
             VALUES ($1, $2)
             RETURNING id, author_id, text, created_at`,
            [decoded.userId, text]
        );

        const user = await pool.query('SELECT login FROM users WHERE id = $1', [decoded.userId]);
        const post = result.rows[0];
        post.author = user.rows[0].login;

        res.json({ success: true, post });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/posts/:id', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const decoded = jwt.verify(token, JWT_SECRET);

        await pool.query(
            'DELETE FROM posts WHERE id = $1 AND author_id = $2',
            [req.params.id, decoded.userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============================================================
//  ДРУЗЬЯ
// ============================================================
app.get('/api/friends', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const decoded = jwt.verify(token, JWT_SECRET);

        const result = await pool.query(
            `SELECT u.id, u.login, u.email, u.bio
             FROM friends f
             JOIN users u ON f.friend_id = u.id
             WHERE f.user_id = $1 AND f.status = 'accepted'
             UNION
             SELECT u.id, u.login, u.email, u.bio
             FROM friends f
             JOIN users u ON f.user_id = u.id
             WHERE f.friend_id = $1 AND f.status = 'accepted'`,
            [decoded.userId]
        );
        res.json({ friends: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/friends/requests', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const decoded = jwt.verify(token, JWT_SECRET);

        const result = await pool.query(
            `SELECT f.id, f.user_id as from, u.login as from_login
             FROM friends f
             JOIN users u ON f.user_id = u.id
             WHERE f.friend_id = $1 AND f.status = 'pending'`,
            [decoded.userId]
        );
        res.json({ requests: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/friends/request', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const { targetId } = req.body;
        const decoded = jwt.verify(token, JWT_SECRET);

        await pool.query(
            'INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3)',
            [decoded.userId, targetId, 'pending']
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/friends/accept', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const { requestId } = req.body;
        const decoded = jwt.verify(token, JWT_SECRET);

        const result = await pool.query(
            'UPDATE friends SET status = $1 WHERE id = $2 AND friend_id = $3 RETURNING user_id',
            ['accepted', requestId, decoded.userId]
        );

        if (result.rows.length > 0) {
            await pool.query(
                'INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3)',
                [result.rows[0].user_id, decoded.userId, 'accepted']
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/friends/reject', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const { requestId } = req.body;
        const decoded = jwt.verify(token, JWT_SECRET);

        await pool.query(
            'DELETE FROM friends WHERE id = $1 AND friend_id = $2 AND status = $3',
            [requestId, decoded.userId, 'pending']
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/friends/remove', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const { friendId } = req.body;
        const decoded = jwt.verify(token, JWT_SECRET);

        await pool.query(
            `DELETE FROM friends
             WHERE (user_id = $1 AND friend_id = $2)
                OR (user_id = $2 AND friend_id = $1)`,
            [decoded.userId, friendId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============================================================
//  СООБЩЕНИЯ
// ============================================================
app.get('/api/messages/:userId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const decoded = jwt.verify(token, JWT_SECRET);
        const { userId } = req.params;

        const result = await pool.query(
            `SELECT m.*, u.login as from_login
             FROM messages m
             JOIN users u ON m.from_user = u.id
             WHERE (from_user = $1 AND to_user = $2)
                OR (from_user = $2 AND to_user = $1)
             ORDER BY m.created_at DESC
             LIMIT 50`,
            [decoded.userId, userId]
        );
        res.json({ messages: result.rows.reverse() });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/messages/:userId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const { text } = req.body;
        const { userId } = req.params;
        const decoded = jwt.verify(token, JWT_SECRET);

        const result = await pool.query(
            `INSERT INTO messages (from_user, to_user, text)
             VALUES ($1, $2, $3)
             RETURNING id, from_user, to_user, text, is_read, created_at`,
            [decoded.userId, userId, text]
        );

        const user = await pool.query('SELECT login FROM users WHERE id = $1', [decoded.userId]);
        const message = result.rows[0];
        message.from_login = user.rows[0].login;

        const targetWs = clients.get(userId);
        if (targetWs) {
            targetWs.send(JSON.stringify({
                type: 'new_message',
                from: decoded.userId,
                fromLogin: user.rows[0].login,
                message
            }));
        }

        res.json({ success: true, message });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============================================================
//  ГРУППЫ
// ============================================================
app.get('/api/groups', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT g.*, u.login as creator_login
             FROM groups g
             JOIN users u ON g.creator_id = u.id`
        );
        res.json({ groups: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/groups', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const { name, description } = req.body;
        const decoded = jwt.verify(token, JWT_SECRET);

        const result = await pool.query(
            `INSERT INTO groups (name, description, creator_id)
             VALUES ($1, $2, $3)
             RETURNING id, name, description, creator_id, created_at`,
            [name, description || 'Новая группа', decoded.userId]
        );
        res.json({ success: true, group: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============================================================
//  WEBSOCKET
// ============================================================
wss.on('connection', (ws) => {
    let userId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'auth') {
                const decoded = jwt.verify(data.token, JWT_SECRET);
                userId = decoded.userId;
                clients.set(userId, ws);
                console.log(`🔌 ${decoded.login} подключился`);
                return;
            }

            if (!userId) return;

            switch (data.type) {
                case 'call_offer':
                    const targetOffer = clients.get(data.targetId);
                    if (targetOffer) {
                        targetOffer.send(JSON.stringify({
                            type: 'call_offer',
                            from: userId,
                            offer: data.offer,
                            callType: data.callType
                        }));
                    }
                    break;

                case 'call_answer':
                    const targetAnswer = clients.get(data.targetId);
                    if (targetAnswer) {
                        targetAnswer.send(JSON.stringify({
                            type: 'call_answer',
                            from: userId,
                            answer: data.answer
                        }));
                    }
                    break;

                case 'ice_candidate':
                    const targetIce = clients.get(data.targetId);
                    if (targetIce) {
                        targetIce.send(JSON.stringify({
                            type: 'ice_candidate',
                            from: userId,
                            candidate: data.candidate
                        }));
                    }
                    break;

                case 'call_end':
                    const targetEnd = clients.get(data.targetId);
                    if (targetEnd) {
                        targetEnd.send(JSON.stringify({
                            type: 'call_end',
                            from: userId
                        }));
                    }
                    break;
            }
        } catch (err) {
            console.error('WS error:', err);
        }
    });

    ws.on('close', () => {
        if (userId) {
            clients.delete(userId);
            console.log(`🔌 Пользователь ${userId} отключился`);
        }
    });
});

// ============================================================
//  ЗАПУСК
// ============================================================
const PORT = process.env.PORT || 3000;

(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                login VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                bio TEXT DEFAULT '🌟 Пользователь WOND',
                verified BOOLEAN DEFAULT FALSE,
                verification_code VARCHAR(6),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                author_id UUID REFERENCES users(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS friends (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, friend_id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                from_user UUID REFERENCES users(id) ON DELETE CASCADE,
                to_user UUID REFERENCES users(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS groups (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ База данных готова');

        // ============================================================
        //  ТЕСТОВЫЙ ПОЛЬЗОВАТЕЛЬ — ИСПРАВЛЕНО!
        // ============================================================
        const testHash = await bcrypt.hash('123456', 10);
        await pool.query(`
            INSERT INTO users (id, login, email, password_hash, verified)
            VALUES (gen_random_uuid(), $1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
        `, ['test', 'test@wond.com', testHash, true]);

        console.log('🧪 Тестовый пользователь: test / 123456');

    } catch (err) {
        console.error('❌ Ошибка БД:', err);
        process.exit(1);
    }

    server.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════╗
║   🚀 WOND — ПРОДАКШН НА RENDER                   ║
║                                                    ║
║   🌐 http://localhost:${PORT}                       ║
║   👨‍💼 CEO: LEV USKOV                             ║
║                                                    ║
║   ✅ ВСЁ РАБОТАЕТ!                                ║
╚════════════════════════════════════════════════════╝
        `);
    });
})();
