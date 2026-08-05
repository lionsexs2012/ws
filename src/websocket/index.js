const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const winston = require('winston');

let wss = null;
const clients = new Map();

const init = (server) => {
    wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws) => {
        let userId = null;
        let userLogin = null;
        
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                
                if (data.type === 'auth') {
                    try {
                        const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
                        userId = decoded.userId;
                        userLogin = decoded.login;
                        
                        clients.set(userId, ws);
                        winston.info(`🔌 ${userLogin} подключился к WebSocket`);
                        
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
                        const targetOffer = clients.get(data.targetId);
                        if (targetOffer) {
                            targetOffer.send(JSON.stringify({
                                type: 'call_offer',
                                from: userId,
                                fromLogin: userLogin,
                                offer: data.offer,
                                callType: data.callType
                            }));
                            winston.info(`📞 ${userLogin} звонит ${data.targetId}`);
                        } else {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Пользователь не в сети'
                            }));
                        }
                        break;
                        
                    case 'call_answer':
                        const targetAnswer = clients.get(data.targetId);
                        if (targetAnswer) {
                            targetAnswer.send(JSON.stringify({
                                type: 'call_answer',
                                from: userId,
                                fromLogin: userLogin,
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
                                from: userId,
                                fromLogin: userLogin
                            }));
                        }
                        winston.info(`📞 ${userLogin} завершил звонок`);
                        break;
                        
                    case 'call_reject':
                        const targetReject = clients.get(data.targetId);
                        if (targetReject) {
                            targetReject.send(JSON.stringify({
                                type: 'call_reject',
                                from: userId,
                                fromLogin: userLogin
                            }));
                        }
                        break;
                        
                    default:
                        winston.warn(`Неизвестный тип: ${data.type}`);
                }
                
            } catch (err) {
                winston.error('WebSocket error:', err);
            }
        });
        
        ws.on('close', () => {
            if (userId) {
                clients.delete(userId);
                winston.info(`🔌 ${userLogin} отключился`);
                broadcast({
                    type: 'user_offline',
                    userId,
                    login: userLogin
                });
            }
        });
        
        ws.on('error', (err) => {
            winston.error('WebSocket error:', err);
        });
    });
    
    winston.info('✅ WebSocket сервер запущен');
    return wss;
};

const broadcast = (data) => {
    const message = JSON.stringify(data);
    for (const [id, client] of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
};

const sendToUser = (userId, data) => {
    const client = clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
        return true;
    }
    return false;
};

module.exports = { init, broadcast, sendToUser, getClients: () => clients };
