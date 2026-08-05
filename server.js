require('dotenv').config();
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
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

// Хранилища (в продакшене — база данных)
const users = new Map(); // email -> { id, login, email, passwordHash, friends, createdAt }
const sessions = new Map(); // token -> { userId, login, expires }
const wsClients = new Map(); // userId -> ws

// ============================================================
//  HTTP СЕРВЕР
// ============================================================
const server = http.createServer((req, res) => {
    // CORS для API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API маршруты
    if (req.url === '/api/register' && req.method === 'POST') {
        handleRegister(req, res);
        return;
    }

    if (req.url === '/api/login' && req.method === 'POST') {
        handleLogin(req, res);
        return;
    }

    if (req.url === '/api/verify' && req.method === 'GET') {
        handleVerify(req, res);
        return;
    }

    if (req.url === '/api/users' && req.method === 'GET') {
        handleGetUsers(req, res);
        return;
    }

    if (req.url === '/api/profile' && req.method === 'GET') {
        handleGetProfile(req, res);
        return;
    }

    if (req.url === '/api/profile' && req.method === 'POST') {
        handleUpdateProfile(req, res);
        return;
    }

    if (req.url === '/api/friends' && req.method === 'GET') {
        handleGetFriends(req, res);
        return;
    }

    if (req.url === '/api/friends/request' && req.method === 'POST') {
        handleFriendRequest(req, res);
        return;
    }

    if (req.url === '/api/friends/accept' && req.method === 'POST') {
        handleAcceptFriend(req, res);
        return;
    }

    if (req.url === '/api/friends/reject' && req.method === 'POST') {
        handleRejectFriend(req, res);
        return;
    }

    if (req.url === '/api/friends/remove' && req.method === 'POST') {
        handleRemoveFriend(req, res);
        return;
    }

    // Статика
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Ошибка загрузки');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

// ============================================================
//  API ОБРАБОТЧИКИ
// ============================================================

// Регистрация
async function handleRegister(req, res) {
    try {
        const body = await getRequestBody(req);
        const { login, email, password } = JSON.parse(body);

        // Валидация
        if (!login || !email || !password) {
            sendJson(res, 400, { error: 'Все поля обязательны' });
            return;
        }

        if (password.length < 6) {
            sendJson(res, 400, { error: 'Пароль должен быть минимум 6 символов' });
            return;
        }

        if (!email.includes('@')) {
            sendJson(res, 400, { error: 'Некорректный email' });
            return;
        }

        // Проверка на существование
        for (const [key, user] of users) {
            if (user.login === login) {
                sendJson(res, 400, { error: 'Логин уже занят' });
                return;
            }
            if (user.email === email) {
                sendJson(res, 400, { error: 'Email уже зарегистрирован' });
                return;
            }
        }

        // Хешируем пароль
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const userId = uuidv4();

        const newUser = {
            id: userId,
            login,
            email,
            passwordHash,
            friends: [],
            friendRequests: [],
            bio: '🌟 Пользователь WOND',
            createdAt: new Date().toISOString(),
            online: false
        };

        users.set(userId, newUser);

        // Генерируем JWT
        const token = jwt.sign(
            { userId, login, email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        sendJson(res, 200, {
            success: true,
            token,
            user: {
                id: userId,
                login,
                email,
                bio: newUser.bio,
                friends: []
            }
        });

        console.log(`✅ Зарегистрирован: ${login} (${email})`);

    } catch (err) {
        console.error('Register error:', err);
        sendJson(res, 500, { error: 'Ошибка сервера' });
    }
}

// Вход
async function handleLogin(req, res) {
    try {
        const body = await getRequestBody(req);
        const { login, password } = JSON.parse(body);

        if (!login || !password) {
            sendJson(res, 400, { error: 'Все поля обязательны' });
            return;
        }

        // Ищем пользователя
        let foundUser = null;
        for (const [key, user] of users) {
            if (user.login === login || user.email === login) {
                foundUser = user;
                break;
            }
        }

        if (!foundUser) {
            sendJson(res, 401, { error: 'Неверный логин или пароль' });
            return;
        }

        // Проверяем пароль
        const isValid = await bcrypt.compare(password, foundUser.passwordHash);
        if (!isValid) {
            sendJson(res, 401, { error: 'Неверный логин или пароль' });
            return;
        }

        // Генерируем JWT
        const token = jwt.sign(
            { userId: foundUser.id, login: foundUser.login, email: foundUser.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        sendJson(res, 200, {
            success: true,
            token,
            user: {
                id: foundUser.id,
                login: foundUser.login,
                email: foundUser.email,
                bio: foundUser.bio,
                friends: foundUser.friends || []
            }
        });

        console.log(`✅ Вход: ${foundUser.login}`);

    } catch (err) {
        console.error('Login error:', err);
        sendJson(res, 500, { error: 'Ошибка сервера' });
    }
}

// Проверка токена
function handleVerify(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Токен не предоставлен' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.userId);

        if (!user) {
            sendJson(res, 401, { error: 'Пользователь не найден' });
            return;
        }

        sendJson(res, 200, {
            valid: true,
            user: {
                id: user.id,
                login: user.login,
                email: user.email,
                bio: user.bio,
                friends: user.friends || []
            }
        });
    } catch (err) {
        sendJson(res, 401, { error: 'Недействительный токен' });
    }
}

// Получить всех пользователей
function handleGetUsers(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Не авторизован' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userList = Array.from(users.values()).map(u => ({
            id: u.id,
            login: u.login,
            email: u.email,
            bio: u.bio,
            online: wsClients.has(u.id),
            friends: u.friends || []
        }));

        sendJson(res, 200, { users: userList });
    } catch (err) {
        sendJson(res, 401, { error: 'Недействительный токен' });
    }
}

// Получить профиль
function handleGetProfile(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Не авторизован' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.userId);

        if (!user) {
            sendJson(res, 404, { error: 'Пользователь не найден' });
            return;
        }

        sendJson(res, 200, {
            id: user.id,
            login: user.login,
            email: user.email,
            bio: user.bio,
            friends: user.friends || [],
            createdAt: user.createdAt
        });
    } catch (err) {
        sendJson(res, 401, { error: 'Недействительный токен' });
    }
}

// Обновить профиль
async function handleUpdateProfile(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Не авторизован' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.userId);

        if (!user) {
            sendJson(res, 404, { error: 'Пользователь не найден' });
            return;
        }

        const body = await getRequestBody(req);
        const { bio } = JSON.parse(body);

        if (bio !== undefined) {
            user.bio = bio;
        }

        users.set(user.id, user);

        sendJson(res, 200, {
            success: true,
            user: {
                id: user.id,
                login: user.login,
                email: user.email,
                bio: user.bio,
                friends: user.friends || []
            }
        });
    } catch (err) {
        console.error('Update profile error:', err);
        sendJson(res, 500, { error: 'Ошибка сервера' });
    }
}

// Друзья
function handleGetFriends(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Не авторизован' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.userId);

        if (!user) {
            sendJson(res, 404, { error: 'Пользователь не найден' });
            return;
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

        sendJson(res, 200, { friends: friendsList, requests });
    } catch (err) {
        sendJson(res, 401, { error: 'Недействительный токен' });
    }
}

async function handleFriendRequest(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Не авторизован' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.userId);

        if (!user) {
            sendJson(res, 404, { error: 'Пользователь не найден' });
            return;
        }

        const body = await getRequestBody(req);
        const { targetId } = JSON.parse(body);

        const target = users.get(targetId);
        if (!target) {
            sendJson(res, 404, { error: 'Пользователь не найден' });
            return;
        }

        if (user.id === targetId) {
            sendJson(res, 400, { error: 'Нельзя добавить себя' });
            return;
        }

        // Проверяем, уже друзья
        if ((user.friends || []).includes(targetId)) {
            sendJson(res, 400, { error: 'Уже в друзьях' });
            return;
        }

        // Проверяем, есть ли уже заявка
        const existing = (target.friendRequests || []).find(r => r.from === user.id && r.status === 'pending');
        if (existing) {
            sendJson(res, 400, { error: 'Заявка уже отправлена' });
            return;
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

        // Отправляем уведомление через WebSocket
        const targetWs = wsClients.get(targetId);
        if (targetWs) {
            targetWs.send(JSON.stringify({
                type: 'friend_request',
                from: user.id,
                fromLogin: user.login,
                requestId: requestId
            }));
        }

        sendJson(res, 200, { success: true, requestId });
        console.log(`📨 ${user.login} отправил заявку ${target.login}`);

    } catch (err) {
        console.error('Friend request error:', err);
        sendJson(res, 500, { error: 'Ошибка сервера' });
    }
}

async function handleAcceptFriend(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Не авторизован' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.userId);

        if (!user) {
            sendJson(res, 404, { error: 'Пользователь не найден' });
            return;
        }

        const body = await getRequestBody(req);
        const { requestId } = JSON.parse(body);

        const request = (user.friendRequests || []).find(r => r.id === requestId);
        if (!request) {
            sendJson(res, 404, { error: 'Заявка не найдена' });
            return;
        }

        request.status = 'accepted';

        // Добавляем в друзья
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

            // Уведомляем друга
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

        sendJson(res, 200, { success: true });
        console.log(`✅ ${user.login} принял заявку от ${request.from}`);

    } catch (err) {
        console.error('Accept friend error:', err);
        sendJson(res, 500, { error: 'Ошибка сервера' });
    }
}

async function handleRejectFriend(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Не авторизован' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.userId);

        if (!user) {
            sendJson(res, 404, { error: 'Пользователь не найден' });
            return;
        }

        const body = await getRequestBody(req);
        const { requestId } = JSON.parse(body);

        user.friendRequests = (user.friendRequests || []).filter(r => r.id !== requestId);
        users.set(user.id, user);

        sendJson(res, 200, { success: true });
    } catch (err) {
        console.error('Reject friend error:', err);
        sendJson(res, 500, { error: 'Ошибка сервера' });
    }
}

async function handleRemoveFriend(req, res) {
    const token = getTokenFromHeader(req);
    if (!token) {
        sendJson(res, 401, { error: 'Не авторизован' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.get(decoded.userId);

        if (!user) {
            sendJson(res, 404, { error: 'Пользователь не найден' });
            return;
        }

        const body = await getRequestBody(req);
        const { friendId } = JSON.parse(body);

        user.friends = (user.friends || []).filter(id => id !== friendId);
        users.set(user.id, user);

        // Удаляем и у друга
        const friend = users.get(friendId);
        if (friend) {
            friend.friends = (friend.friends || []).filter(id => id !== user.id);
            users.set(friend.id, friend);
        }

        sendJson(res, 200, { success: true });
    } catch (err) {
        console.error('Remove friend error:', err);
        sendJson(res, 500, { error: 'Ошибка сервера' });
    }
}

// ============================================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function getTokenFromHeader(req) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        return auth.substring(7);
    }
    return null;
}

// ============================================================
//  WEBSOCKET СЕРВЕР
// ============================================================
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    let userId = null;
    let userLogin = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // Первое сообщение должно содержать токен
            if (data.type === 'auth') {
                try {
                    const decoded = jwt.verify(data.token, JWT_SECRET);
                    userId = decoded.userId;
                    userLogin = decoded.login;

                    // Проверяем, есть ли пользователь
                    const user = users.get(userId);
                    if (!user) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Пользователь не найден' }));
                        ws.close();
                        return;
                    }

                    wsClients.set(userId, ws);
                    console.log(`🔌 ${userLogin} подключился к WebSocket`);

                    // Отправляем подтверждение
                    ws.send(JSON.stringify({
                        type: 'auth_success',
                        userId,
                        login: userLogin
                    }));

                    // Уведомляем всех об онлайне
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

            // Если не авторизован — игнорируем
            if (!userId) {
                ws.send(JSON.stringify({ type: 'error', message: 'Не авторизован' }));
                return;
            }

            // Обработка звонков
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

            // Уведомляем всех об офлайне
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

// ============================================================
//  BROADCAST
// ============================================================
function broadcast(data) {
    const message = JSON.stringify(data);
    for (const [id, client] of wsClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

// ============================================================
//  ЗАПУСК СЕРВЕРА
// ============================================================
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║        🚀 WOND — БЕЗОПАСНЫЙ СЕРВЕР               ║
║                                                    ║
║   📡 WebSocket: ws://localhost:${PORT}              ║
║   🌐 API:       http://localhost:${PORT}/api        ║
║                                                    ║
║   🔒 JWT + bcrypt шифрование                      ║
║   📧 Регистрация по email                         ║
║   👨‍💼 CEO: LEV USKOV                             ║
║                                                    ║
║   ✅ Сервер запущен!                               ║
╚════════════════════════════════════════════════════╝
    `);
});

// Добавляем тестового пользователя для удобства
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
        createdAt: new Date().toISOString()
    };
    users.set('test-user-1', testUser);
    console.log('🧪 Тестовый пользователь: test / 123456');
})();
