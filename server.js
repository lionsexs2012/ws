const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================
//  HTTP СЕРВЕР (для статики)
// ============================================================
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Ошибка загрузки');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// ============================================================
//  WEBSOCKET СЕРВЕР
// ============================================================
const wss = new WebSocket.Server({ server });

// Хранилище подключений
const clients = new Map(); // login -> ws

wss.on('connection', (ws) => {
    let userLogin = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`📨 Получено от ${userLogin || 'anon'}:`, data.type);
            
            switch(data.type) {
                case 'login':
                    userLogin = data.login;
                    clients.set(userLogin, ws);
                    console.log(`✅ ${userLogin} подключился`);
                    // Отправляем список пользователей
                    broadcast({
                        type: 'users',
                        users: Array.from(clients.keys())
                    });
                    break;
                    
                case 'logout':
                    if (userLogin) {
                        clients.delete(userLogin);
                        console.log(`❌ ${userLogin} отключился`);
                        broadcast({
                            type: 'users',
                            users: Array.from(clients.keys())
                        });
                    }
                    break;
                    
                case 'call_offer':
                    // Пересылаем offer целевому пользователю
                    const targetOffer = clients.get(data.target);
                    if (targetOffer) {
                        targetOffer.send(JSON.stringify({
                            type: 'call_offer',
                            from: userLogin,
                            offer: data.offer,
                            callType: data.callType
                        }));
                        console.log(`📞 ${userLogin} звонит ${data.target}`);
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Пользователь не в сети'
                        }));
                    }
                    break;
                    
                case 'call_answer':
                    const targetAnswer = clients.get(data.target);
                    if (targetAnswer) {
                        targetAnswer.send(JSON.stringify({
                            type: 'call_answer',
                            from: userLogin,
                            answer: data.answer
                        }));
                        console.log(`✅ ${userLogin} ответил ${data.target}`);
                    }
                    break;
                    
                case 'ice_candidate':
                    const targetIce = clients.get(data.target);
                    if (targetIce) {
                        targetIce.send(JSON.stringify({
                            type: 'ice_candidate',
                            from: userLogin,
                            candidate: data.candidate
                        }));
                    }
                    break;
                    
                case 'call_end':
                    const targetEnd = clients.get(data.target);
                    if (targetEnd) {
                        targetEnd.send(JSON.stringify({
                            type: 'call_end',
                            from: userLogin
                        }));
                    }
                    console.log(`📞 ${userLogin} завершил звонок с ${data.target}`);
                    break;
                    
                case 'call_reject':
                    const targetReject = clients.get(data.target);
                    if (targetReject) {
                        targetReject.send(JSON.stringify({
                            type: 'call_reject',
                            from: userLogin
                        }));
                    }
                    console.log(`❌ ${userLogin} отклонил звонок от ${data.target}`);
                    break;
                    
                default:
                    console.log('Неизвестный тип:', data.type);
            }
            
        } catch (err) {
            console.error('Ошибка обработки сообщения:', err);
        }
    });
    
    ws.on('close', () => {
        if (userLogin) {
            clients.delete(userLogin);
            console.log(`❌ ${userLogin} отключился`);
            broadcast({
                type: 'users',
                users: Array.from(clients.keys())
            });
        }
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket ошибка:', err);
    });
});

// ============================================================
//  BROADCAST
// ============================================================
function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ============================================================
//  ЗАПУСК СЕРВЕРА
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║      🚀 WOND СЕРВЕР ЗАПУЩЕН          ║
║                                       ║
║   📡 WebSocket: ws://localhost:${PORT}   ║
║   🌐 HTTP:      http://localhost:${PORT}   ║
║                                       ║
║   👨‍💼 CEO: LEV USKOV                   ║
║   📞 Реальные звонки работают!        ║
╚═══════════════════════════════════════╝
    `);
});
