const { query } = require('../config/database');
const { hashPassword } = require('../config/auth');
const { generateId } = require('../utils/helpers');

class User {
    static async create(login, email, password) {
        const id = generateId();
        const passwordHash = await hashPassword(password);
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        const result = await query(
            `INSERT INTO users (id, login, email, password_hash, verification_code)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, login, email, verified, bio`,
            [id, login, email, passwordHash, verificationCode]
        );
        
        return result.rows[0];
    }

    static async findByLogin(login) {
        const result = await query(
            'SELECT * FROM users WHERE login = $1 OR email = $2',
            [login, login]
        );
        return result.rows[0] || null;
    }

    static async findById(id) {
        const result = await query(
            'SELECT id, login, email, bio, verified, is_online, last_seen, created_at FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    static async updateVerification(id, code) {
        await query(
            'UPDATE users SET verification_code = $1 WHERE id = $2',
            [code, id]
        );
    }

    static async verifyEmail(id) {
        const result = await query(
            'UPDATE users SET verified = TRUE, verification_code = NULL WHERE id = $1 RETURNING id, login, email, bio',
            [id]
        );
        return result.rows[0] || null;
    }

    static async updateBio(id, bio) {
        const result = await query(
            'UPDATE users SET bio = $1 WHERE id = $2 RETURNING id, login, email, bio, verified',
            [bio, id]
        );
        return result.rows[0] || null;
    }

    static async setOnline(id, online) {
        await query(
            'UPDATE users SET is_online = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
            [online, id]
        );
    }

    static async getFriends(id) {
        const result = await query(
            `SELECT u.id, u.login, u.email, u.bio, u.is_online
             FROM friends f
             JOIN users u ON f.friend_id = u.id
             WHERE f.user_id = $1 AND f.status = 'accepted'
             UNION
             SELECT u.id, u.login, u.email, u.bio, u.is_online
             FROM friends f
             JOIN users u ON f.user_id = u.id
             WHERE f.friend_id = $1 AND f.status = 'accepted'`,
            [id]
        );
        return result.rows;
    }

    static async getFriendRequests(id) {
        const result = await query(
            `SELECT f.id, f.user_id as from, u.login as from_login, f.created_at
             FROM friends f
             JOIN users u ON f.user_id = u.id
             WHERE f.friend_id = $1 AND f.status = 'pending'`,
            [id]
        );
        return result.rows;
    }

    static async search(queryStr, excludeId) {
        const result = await query(
            `SELECT id, login, email, bio, is_online
             FROM users
             WHERE (login ILIKE $1 OR email ILIKE $1)
             AND id != $2
             LIMIT 20`,
            [`%${queryStr}%`, excludeId]
        );
        return result.rows;
    }

    static async getAll(excludeId) {
        const result = await query(
            'SELECT id, login, email, bio, is_online, last_seen FROM users WHERE id != $1 ORDER BY login',
            [excludeId]
        );
        return result.rows;
    }
}

module.exports = User;
