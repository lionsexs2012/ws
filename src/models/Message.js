const { query } = require('../config/database');

class Message {
    static async create(fromUser, toUser, text) {
        const result = await query(
            `INSERT INTO messages (from_user, to_user, text)
             VALUES ($1, $2, $3)
             RETURNING id, from_user, to_user, text, is_read, created_at`,
            [fromUser, toUser, text]
        );
        return result.rows[0];
    }

    static async getConversation(user1, user2, limit = 50, offset = 0) {
        const result = await query(
            `SELECT m.*, u.login as from_login
             FROM messages m
             JOIN users u ON m.from_user = u.id
             WHERE (from_user = $1 AND to_user = $2)
                OR (from_user = $2 AND to_user = $1)
             ORDER BY m.created_at DESC
             LIMIT $3 OFFSET $4`,
            [user1, user2, limit, offset]
        );
        return result.rows.reverse();
    }

    static async markAsRead(fromUser, toUser) {
        await query(
            `UPDATE messages
             SET is_read = TRUE
             WHERE from_user = $1 AND to_user = $2 AND is_read = FALSE`,
            [fromUser, toUser]
        );
    }

    static async getUnreadCount(userId) {
        const result = await query(
            'SELECT COUNT(*) as count FROM messages WHERE to_user = $1 AND is_read = FALSE',
            [userId]
        );
        return parseInt(result.rows[0].count);
    }

    static async findById(id) {
        const result = await query(
            'SELECT * FROM messages WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }
}

module.exports = Message;
