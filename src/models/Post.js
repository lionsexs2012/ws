const { query } = require('../config/database');

class Post {
    static async create(authorId, text, groupId = null) {
        const result = await query(
            `INSERT INTO posts (author_id, text, group_id)
             VALUES ($1, $2, $3)
             RETURNING id, author_id, text, group_id, created_at`,
            [authorId, text, groupId]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const result = await query(
            `SELECT p.*, u.login as author
             FROM posts p
             JOIN users u ON p.author_id = u.id
             WHERE p.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    }

    static async findAll(limit = 50, offset = 0) {
        const result = await query(
            `SELECT p.*, u.login as author
             FROM posts p
             JOIN users u ON p.author_id = u.id
             ORDER BY p.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        return result.rows;
    }

    static async findByUser(userId, limit = 50, offset = 0) {
        const result = await query(
            `SELECT p.*, u.login as author
             FROM posts p
             JOIN users u ON p.author_id = u.id
             WHERE p.author_id = $1
             ORDER BY p.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return result.rows;
    }

    static async delete(id, authorId) {
        const result = await query(
            'DELETE FROM posts WHERE id = $1 AND author_id = $2 RETURNING id',
            [id, authorId]
        );
        return result.rows.length > 0;
    }

    static async countByUser(userId) {
        const result = await query(
            'SELECT COUNT(*) as count FROM posts WHERE author_id = $1',
            [userId]
        );
        return parseInt(result.rows[0].count);
    }
}

module.exports = Post;
