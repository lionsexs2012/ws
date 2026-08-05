const redis = require('redis');
const winston = require('winston');

const client = redis.createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
    password: process.env.REDIS_PASSWORD || undefined,
});

client.on('connect', () => {
    winston.info('🔴 Redis подключен');
});

client.on('error', (err) => {
    winston.error('❌ Redis ошибка:', err);
});

const connectRedis = async () => {
    try {
        await client.connect();
        winston.info('✅ Redis готов к работе');
        return true;
    } catch (err) {
        winston.error('❌ Redis не доступен:', err.message);
        return false;
    }
};

// Кеш-утилиты
const cache = {
    get: async (key) => {
        try {
            const data = await client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            return null;
        }
    },
    set: async (key, value, ttl = 3600) => {
        try {
            await client.setEx(key, ttl, JSON.stringify(value));
            return true;
        } catch (err) {
            return false;
        }
    },
    del: async (key) => {
        try {
            await client.del(key);
            return true;
        } catch (err) {
            return false;
        }
    },
    delPattern: async (pattern) => {
        try {
            const keys = await client.keys(pattern);
            if (keys.length) {
                await client.del(keys);
            }
            return true;
        } catch (err) {
            return false;
        }
    },
    increment: async (key, ttl = 60) => {
        try {
            const val = await client.incr(key);
            if (val === 1) {
                await client.expire(key, ttl);
            }
            return val;
        } catch (err) {
            return null;
        }
    }
};

module.exports = { client, connectRedis, cache };
