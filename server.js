require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// ============================================================
//  КОНФИГУРАЦИЯ
// ============================================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'wond-super-secret-key-2026';
const SALT_ROUNDS = 10;

// ============================================================
//  EXPRESS APP
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ============================================================
//  ХРАНИЛИЩА (в памяти — для демо, в продакшене — БД)
// ============================================================
const users = new Map();
const posts = [];
const messages = new Map();
const groups = [];
const wsClients = new Map();
let postIdCounter = 1;
let messageIdCounter = 1;
let groupIdCounter = 1;

// ============================================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getTokenFromHeader(req) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        return auth.substring(7);
    }
    return null;
}

function verifyToken(req, res, next) {
    const token = getTokenFromHeader(req);
    if (!token) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userLogin = decoded.login;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Недействительный токен' });
    }
}

// ============================================================
//  API РОУТЫ
// ============================================================

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { login, email, password } = req.body;

        if (!login || !email || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль минимум 6 символов' });
        }
        if (!email.includes('@')) {
            return res.status(400).json({ error: 'Некорректный email' });
        }

        for (const [key, user] of users) {
            if (user.login === login) {
                return res.status(400).json({ error: 'Логин уже занят' });
            }
            if (user.email === email) {
                return res.status(400).json({ error: 'Email уже зарегистрирован' });
            }
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const userId = uuidv4();
        const verificationCode = generateVerificationCode();

        const newUser = {
            id: userId,
            login,
            email,
            passwordHash,
            friends: [],
            friendRequests: [],
            bio: '🌟 Пользователь WOND',
            verified: false,
            verificationCode,
            createdAt: new Date().toISOString()
        };

        users.set(userId, newUser);

        // В реальном проекте — отправка email через nodemailer
        console.log(`📧 Код подтверждения для ${email}: ${verificationCode}`);

        const token = jwt.sign(
            { userId, login, email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: userId,
                login,
                email,
                bio: newUser.bio,
                verified: false
            }
        });

        console.log(`✅ Зарегистрирован: ${login} (${email})`);

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }

        let foundUser = null;
        for (const [key, user] of users) {
            if (user.login === login || user.email === login) {
                foundUser = user;
                break;
            }
        }

        if (!foundUser) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const isValid = await bcrypt.compare(password, foundUser.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const token = jwt.sign(
            { userId: foundUser.id, login: foundUser.login, email: foundUser.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: foundUser.id,
                login: foundUser.login,
                email: foundUser.email,
                bio: foundUser.bio,
                verified: foundUser.verified || false
            }
        });

        console.log(`✅ Вход: ${foundUser.login}`);

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Проверка токена
app.get('/api/verify', verifyToken, (req, res) => {
    const user = users.get(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({
        valid: true,
        user: {
            id: user.id,
            login: user.login,
            email: user.email,
            bio: user.bio,
            verified: user.verified || false
        }
    });
});

// Подтверждение email
app.post('/api/verify-email', verifyToken, async (req, res) => {
    try {
        const { code } = req.body;
        const user = users.get(req.userId);

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (user.verified) {
            return res.json({ success: true, message: 'Email уже подтверждён' });
        }

        if (user.verificationCode === code) {
            user.verified = true;
            user.verificationCode = null;
            users.set(req.userId, user);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Неверный код подтверждения' });
        }
    } catch (err) {
        console.error('Verify error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Повторная отправка кода
app.post('/api/resend-verification', verifyToken, async (req, res) => {
    try {
        const user = users.get(req.userId);

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (user.verified) {
            return res.json({ success: true, message: 'Email уже подтверждён' });
        }

        const code = generateVerificationCode();
        user.verificationCode = code;
        users.set(req.userId, user);

        console.log(`📧 Новый код для ${user.email}: ${code}`);

        res.json({ success: true });
    } catch (err) {
        console.error('Resend error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить всех пользователей
app.get('/api/users', verifyToken, (req, res) => {
    const userList = Array.from(users.values()).map(u => ({
        id: u.id,
        login: u.login,
        email: u.email,
        bio: u.bio,
        online: wsClients.has(u.id),
        friends: u.friends || [],
        verified: u.verified || false
    }));
    res.json({ users: userList });
});

// Получить профиль
app.get('/api/profile', verifyToken, (req, res) => {
    const user = users.get(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({
        id: user.id,
        login: user.login,
        email: user.email,
        bio: user.bio,
        friends: user.friends || [],
        verified: user.verified || false,
        createdAt: user.createdAt
    });
});

// Получить пользователя по ID
app.get('/api/users/:id', verifyToken, (req, res) => {
    const user = users.get(req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({
        user: {
            id: user.id,
            login: user.login,
            email: user.email,
            bio: user.bio,
            verified: user.verified || false,
            online: wsClients.has(user.id)
        }
    });
});

// ============================================================
//  ПОСТЫ
// ============================================================
app.get('/api/posts', verifyToken, (req, res) => {
    res.json({ posts: posts.slice().reverse() });
});

app.post('/api/posts', verifyToken, async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Текст поста обязателен' });
    }

    const user = users.get(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const post = {
        id: postIdCounter++,
        authorId: req.userId,
        author: user.login,
        text: text,
        time: new Date().toLocaleString()
    };

    posts.push(post);
    res.json({ success: true, post });
});

app.delete('/api/posts/:id', verifyToken, (req, res) => {
    const postId = parseInt(req.params.id);
    const index = posts.findIndex(p => p.id === postId);
    if (index === -1) {
        return res.status(404).json({ error: 'Пост не найден' });
    }
    if (posts[index].authorId !== req.userId) {
        return res.status(403).json({ error: 'Нет прав' });
    }
    posts.splice(index, 1);
    res.json({ success: true });
});

// ============================================================
//  ДРУЗЬЯ
// ============================================================
app.get('/api/friends', verifyToken, (req, res) => {
    const user = users.get(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const friendsList = (user.friends || []).map(friendId => {
        const friend = users.get(friendId);
        return friend ? {
            id: friend.id,
            login: friend.login,
            email: friend.email,
            bio: friend.bio,
            online: wsClients.has(friend.id)
        } : null;
    }).filter(Boolean);

    res.json({ friends: friendsList });
});

app.get('/api/friends/requests', verifyToken, (req, res) => {
    const user = users.get(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const requests = (user.friendRequests || [])
        .filter(r => r.status === 'pending')
        .map(r => {
            const fromUser = users.get(r.from);
            return fromUser ? {
                id: r.id,
                from: fromUser.id,
                fromLogin: fromUser.login,
                status: r.status,
                createdAt: r.createdAt
            } : null;
        }).filter(Boolean);

    res.json({ requests });
});

app.post('/api/friends/request', verifyToken, async (req, res) => {
    const { targetId } = req.body;
    const user = users.get(req.userId);
    const target = users.get(targetId);

    if (!user || !target) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (user.id === targetId) {
        return res.status(400).json({ error: 'Нельзя добавить себя' });
    }

    if ((user.friends || []).includes(targetId)) {
        return res.status(400).json({ error: 'Уже в друзьях' });
    }

    const existing = (target.friendRequests || []).find(r => r.from === user.id && r.status === 'pending');
    if (existing) {
        return res.status(400).json({ error: 'Заявка уже отправлена' });
    }

    const requestId = uuidv4();
    if (!target.friendRequests) target.friendRequests = [];
    target.friendRequests.push({
        id: requestId,
        from: user.id,
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    users.set(target.id, target);

    // Уведомление через WebSocket
    const targetWs = wsClients.get(targetId);
    if (targetWs) {
        targetWs.send(JSON.stringify({
            type: 'friend_request',
            from: user.id,
            fromLogin: user.login,
            requestId: requestId
        }));
    }

    res.json({ success: true, requestId });
});

app.post('/api/friends/accept', verifyToken, async (req, res) => {
    const { requestId } = req.body;
    const user = users.get(req.userId);

    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const request = (user.friendRequests || []).find(r => r.id === requestId);
    if (!request) {
        return res.status(404).json({ error: 'Заявка не найдена' });
    }

    request.status = 'accepted';

    if (!user.friends) user.friends = [];
    if (!user.friends.includes(request.from)) {
        user.friends.push(request.from);
    }

    const friend = users.get(request.from);
    if (friend) {
        if (!friend.friends) friend.friends = [];
        if (!friend.friends.includes(user.id)) {
            friend.friends.push(user.id);
        }
        users.set(friend.id, friend);

        const friendWs = wsClients.get(friend.id);
        if (friendWs) {
            friendWs.send(JSON.stringify({
                type: 'friend_accepted',
                from: user.id,
                fromLogin: user.login
            }));
        }
    }

    users.set(user.id, user);
    res.json({ success: true });
});

app.post('/api/friends/reject', verifyToken, async (req, res) => {
    const { requestId } = req.body;
    const user = users.get(req.userId);

    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    user.friendRequests = (user.friendRequests || []).filter(r => r.id !== requestId);
    users.set(user.id, user);
    res.json({ success: true });
});

app.post('/api/friends/remove', verifyToken, async (req, res) => {
    const { friendId } = req.body;
    const user = users.get(req.userId);
    const friend = users.get(friendId);

    if (!user || !friend) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    user.friends = (user.friends || []).filter(id => id !== friendId);
    friend.friends = (friend.friends || []).filter(id => id !== user.id);

    users.set(user.id, user);
    users.set(friend.id, friend);

    res.json({ success: true });
});

// ============================================================
//  СООБЩЕНИЯ
// ============================================================
app.get('/api/messages/:userId', verifyToken, (req, res) => {
    const chatKey = [req.userId, req.params.userId].sort().join('_');
    const msgs = messages.get(chatKey) || [];
    res.json({ messages: msgs });
});

app.post('/api/messages/:userId', verifyToken, async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Текст сообщения обязателен' });
    }

    const targetId = req.params.userId;
    const chatKey = [req.userId, targetId].sort().join('_');

    if (!messages.has(chatKey)) {
        messages.set(chatKey, []);
    }

    const msg = {
        id: messageIdCounter++,
        from: req.userId,
        to: targetId,
        text: text,
        time: new Date().toLocaleString(),
        read: false
    };

    messages.get(chatKey).push(msg);

    // Уведомление через WebSocket
    const targetWs = wsClients.get(targetId);
    if (targetWs) {
        const user = users.get(req.userId);
        targetWs.send(JSON.stringify({
            type: 'new_message',
            from: req.userId,
            fromLogin: user ? user.login : 'Unknown',
            message: msg
        }));
    }

    res.json({ success: true, message: msg });
});

// ============================================================
//  ГРУППЫ
// ============================================================
app.get('/api/groups', verifyToken, (req, res) => {
    res.json({ groups });
});

app.post('/api/groups', verifyToken, async (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Название группы обязательно' });
    }

    const existing = groups.find(g => g.name === name);
    if (existing) {
        return res.status(400).json({ error: 'Группа с таким названием уже существует' });
    }

    const group = {
        id: groupIdCounter++,
        name,
        description: description || 'Новая группа',
        creator: req.userId,
        members: [req.userId],
        created: new Date().toLocaleString()
    };

    groups.push(group);
    res.json({ success: true, group });
});

app.post('/api/groups/:id/join', verifyToken, (req, res) => {
    const groupId = parseInt(req.params.id);
    const group = groups.find(g => g.id === groupId);
    if (!group) {
        return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (group.members.includes(req.userId)) {
        return res.json({ success: true, message: 'Уже в группе' });
    }

    if (group.members.length >= 100) {
        return res.status(400).json({ error: 'Группа заполнена' });
    }

    group.members.push(req.userId);
    res.json({ success: true });
});

app.post('/api/groups/:id/leave', verifyToken, (req, res) => {
    const groupId = parseInt(req.params.id);
    const group = groups.find(g => g.id === groupId);
    if (!group) {
        return res.status(404).json({ error: 'Группа не найдена' });
    }

    group.members = group.members.filter(id => id !== req.userId);
    res.json({ success: true });
});

app.delete('/api/groups/:id', verifyToken, (req, res) => {
    const groupId = parseInt(req.params.id);
    const index = groups.findIndex(g => g.id === groupId);
    if (index === -1) {
        return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (groups[index].creator !== req.userId) {
        return res.status(403).json({ error: 'Только создатель может удалить группу' });
    }

    groups.splice(index, 1);
    res.json({ success: true });
});

// ============================================================
//  ROOT
// ============================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
//  HTTP + WEBSOCKET СЕРВЕР
// ============================================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    let userId = null;
    let userLogin = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'auth') {
                try {
                    const decoded = jwt.verify(data.token, JWT_SECRET);
                    userId = decoded.userId;
                    userLogin = decoded.login;

                    const user = users.get(userId);
                    if (!user) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Пользователь не найден' }));
                        ws.close();
                        return;
                    }

                    wsClients.set(userId, ws);
                    console.log(`🔌 ${userLogin} подключился к WebSocket`);

                    ws.send(JSON.stringify({
                        type: 'auth_success',
                        userId,
                        login: userLogin
                    }));

                    broadcast({
                        type: 'user_online',
                        userId,
                        login: userLogin
                    });

                    return;
                } catch (err) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Недействительный токен' }));
                    ws.close();
                    return;
                }
            }

            if (!userId) {
                ws.send(JSON.stringify({ type: 'error', message: 'Не авторизован' }));
                return;
            }

            switch (data.type) {
                case 'call_offer':
                    const targetOffer = wsClients.get(data.targetId);
                    if (targetOffer) {
                        targetOffer.send(JSON.stringify({
                            type: 'call_offer',
                            from: userId,
                            fromLogin: userLogin,
                            offer: data.offer,
                            callType: data.callType
                        }));
                        console.log(`📞 ${userLogin} звонит ${data.targetId}`);
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Пользователь не в сети'
                        }));
                    }
                    break;

                case 'call_answer':
                    const targetAnswer = wsClients.get(data.targetId);
                    if (targetAnswer) {
                        targetAnswer.send(JSON.stringify({
                            type: 'call_answer',
                            from: userId,
                            fromLogin: userLogin,
                            answer: data.answer
                        }));
                        console.log(`✅ ${userLogin} ответил на звонок`);
                    }
                    break;

                case 'ice_candidate':
                    const targetIce = wsClients.get(data.targetId);
                    if (targetIce) {
                        targetIce.send(JSON.stringify({
                            type: 'ice_candidate',
                            from: userId,
                            candidate: data.candidate
                        }));
                    }
                    break;

                case 'call_end':
                    const targetEnd = wsClients.get(data.targetId);
                    if (targetEnd) {
                        targetEnd.send(JSON.stringify({
                            type: 'call_end',
                            from: userId,
                            fromLogin: userLogin
                        }));
                    }
                    console.log(`📞 ${userLogin} завершил звонок`);
                    break;

                case 'call_reject':
                    const targetReject = wsClients.get(data.targetId);
                    if (targetReject) {
                        targetReject.send(JSON.stringify({
                            type: 'call_reject',
                            from: userId,
                            fromLogin: userLogin
                        }));
                    }
                    console.log(`❌ ${userLogin} отклонил звонок`);
                    break;

                default:
                    console.log('Неизвестный тип:', data.type);
            }

        } catch (err) {
            console.error('WebSocket message error:', err);
            ws.send(JSON.stringify({ type: 'error', message: 'Ошибка обработки' }));
        }
    });

    ws.on('close', () => {
        if (userId) {
            wsClients.delete(userId);
            console.log(`🔌 ${userLogin} отключился`);
            broadcast({
                type: 'user_offline',
                userId,
                login: userLogin
            });
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

function broadcast(data) {
    const message = JSON.stringify(data);
    for (const [id, client] of wsClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

// ============================================================
//  ЗАПУСК
// ============================================================
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║        🚀 WOND — ПОЛНЫЙ СЕРВЕР                   ║
║                                                    ║
║   📡 WebSocket: ws://localhost:${PORT}              ║
║   🌐 HTTP:      http://localhost:${PORT}            ║
║                                                    ║
║   🔒 JWT + bcrypt шифрование                      ║
║   📧 Подтверждение email (код на почту)           ║
║   👨‍💼 CEO: LEV USKOV                             ║
║                                                    ║
║   ✅ Сервер запущен!                               ║
╚════════════════════════════════════════════════════╝
    `);
});

// Добавляем тестового пользователя
(async () => {
    const testPassword = await bcrypt.hash('123456', SALT_ROUNDS);
    const testUser = {
        id: 'test-user-1',
        login: 'test',
        email: 'test@wond.com',
        passwordHash: testPassword,
        friends: [],
        friendRequests: [],
        bio: '🧪 Тестовый аккаунт',
        verified: true,
        verificationCode: null,
        createdAt: new Date().toISOString()
    };
    users.set('test-user-1', testUser);
    console.log('🧪 Тестовый пользователь: test / 123456 (Email подтверждён)');
})();
