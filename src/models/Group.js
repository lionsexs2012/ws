const { query } = require('../config/database');

class Group {
    static async create(name, description, creatorId) {
        const result = await query(
            `INSERT INTO groups (name, description, creator_id)
             VALUES ($1, $2, $3)
             RETURNING id, name, description, creator_id, created_at`,
            [name, description, creatorId]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const result = await query(
            `SELECT g.*, u.login as creator_login
             FROM groups g
             JOIN users u ON g.creator_id = u.id
             WHERE g.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    }

    static async findAll() {
        const result = await query(
            `SELECT g.*, u.login as creator_login,
             (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
             FROM groups g
             JOIN users u ON g.creator_id = u.id
             ORDER BY g.created_at DESC`
        );
        return result.rows;
    }

    static async getMembers(groupId) {
        const result = await query(
            `SELECT u.id, u.login, u.bio, gm.role, gm.joined_at
             FROM group_members gm
             JOIN users u ON gm.user_id = u.id
             WHERE gm.group_id = $1`,
            [groupId]
        );
        return result.rows;
    }

    static async addMember(groupId, userId, role = 'member') {
        const result = await query(
            `INSERT INTO group_members (group_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (group_id, user_id) DO NOTHING
             RETURNING *`,
            [groupId, userId, role]
        );
        return result.rows[0] || null;
    }

    static async removeMember(groupId, userId) {
        await query(
            'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, userId]
        );
    }

    static async isMember(groupId, userId) {
        const result = await query(
            'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, userId]
        );
        return result.rows.length > 0;
    }

    static async getMemberCount(groupId) {
        const result = await query(
            'SELECT COUNT(*) as count FROM group_members WHERE group_id = $1',
            [groupId]
        );
        return parseInt(result.rows[0].count);
    }

    static async delete(id, creatorId) {
        const result = await query(
            'DELETE FROM groups WHERE id = $1 AND creator_id = $2 RETURNING id',
            [id, creatorId]
        );
        return result.rows.length > 0;
    }
}

module.exports = Group;
