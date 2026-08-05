const { Pool } = require('pg');
const winston = require('winston');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'wond_db',
    user: process.env.DB_USER || 'wond_user',
    password: process.env.DB_PASSWORD || 'wond_password',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    winston.info('📦 PostgreSQL подключен');
});

pool.on('error', (err) => {
    winston.error('❌ PostgreSQL ошибка:', err);
});

const testConnection = async () => {
    try {
        const client = await pool.connect();
        winston.info('✅ PostgreSQL готов к работе');
        client.release();
        return true;
    } catch (err) {
        winston.error('❌ PostgreSQL не доступен:', err.message);
        return false;
    }
};

// Query с логированием
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 100) {
            winston.warn(`⚠️ Медленный запрос: ${duration}ms`, { text, params });
        }
        return res;
    } catch (err) {
        winston.error('❌ Ошибка запроса:', { text, params, error: err.message });
        throw err;
    }
};

module.exports = { pool, query, testConnection };
