const { query } = require('../config/database');

class Friend {
    static async sendRequest(userId, friendId) {
        const result = await query(
            `INSERT INTO friends (user_id, friend_id, status)
             VALUES ($1, $2, 'pending')
             ON CONFLICT (user_id, friend_id) DO NOTHING
             RETURNING id`,
            [userId, friendId]
        );
        return result.rows[0] || null;
    }

    static async acceptRequest(requestId, userId) {
        const result = await query(
            `UPDATE friends
             SET status = 'accepted'
             WHERE id = $1 AND friend_id = $2 AND status = 'pending'
             RETURNING user_id, friend_id`,
            [requestId, userId]
        );
        
        if (result.rows.length === 0) return null;
        
        const { user_id, friend_id } = result.rows[0];
        
        // Добавляем обратную связь
        await query(
            `INSERT INTO friends (user_id, friend_id, status)
             VALUES ($1, $2, 'accepted')
             ON CONFLICT (user_id, friend_id) DO NOTHING`,
            [friend_id, user_id]
        );
        
        return result.rows[0];
    }

    static async rejectRequest(requestId, userId) {
        await query(
            'DELETE FROM friends WHERE id = $1 AND friend_id = $2 AND status = $3',
            [requestId, userId, 'pending']
        );
    }

    static async removeFriend(userId, friendId) {
        await query(
            `DELETE FROM friends
             WHERE (user_id = $1 AND friend_id = $2)
                OR (user_id = $2 AND friend_id = $1)`,
            [userId, friendId]
        );
    }

    static async getFriends(userId) {
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
            [userId]
        );
        return result.rows;
    }

    static async getRequests(userId) {
        const result = await query(
            `SELECT f.id, f.user_id as from, u.login as from_login, f.created_at
             FROM friends f
             JOIN users u ON f.user_id = u.id
             WHERE f.friend_id = $1 AND f.status = 'pending'`,
            [userId]
        );
        return result.rows;
    }

    static async areFriends(userId, friendId) {
        const result = await query(
            `SELECT * FROM friends
             WHERE ((user_id = $1 AND friend_id = $2)
                OR (user_id = $2 AND friend_id = $1))
             AND status = 'accepted'`,
            [userId, friendId]
        );
        return result.rows.length > 0;
    }

    static async hasPendingRequest(userId, friendId) {
        const result = await query(
            `SELECT * FROM friends
             WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
            [userId, friendId]
        );
        return result.rows.length > 0;
    }
}

module.exports = Friend;
