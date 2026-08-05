const Group = require('../models/Group');
const User = require('../models/User');
const winston = require('winston');

const getGroups = async (req, res) => {
    try {
        const groups = await Group.findAll();
        
        // Добавляем участников
        for (const group of groups) {
            group.members = await Group.getMembers(group.id);
        }
        
        res.json({ groups });
        
    } catch (err) {
        winston.error('Get groups error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const createGroup = async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Название группы обязательно' });
        }
        if (name.length > 100) {
            return res.status(400).json({ error: 'Максимум 100 символов' });
        }
        
        const group = await Group.create(name, description || 'Новая группа', req.userId);
        
        // Добавляем создателя в участники
        await Group.addMember(group.id, req.userId, 'creator');
        
        res.json({ success: true, group });
        
    } catch (err) {
        winston.error('Create group error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const joinGroup = async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        const memberCount = await Group.getMemberCount(groupId);
        if (memberCount >= 100) {
            return res.status(400).json({ error: 'Группа заполнена (максимум 100 участников)' });
        }
        
        const isMember = await Group.isMember(groupId, req.userId);
        if (isMember) {
            return res.json({ success: true, message: 'Уже в группе' });
        }
        
        await Group.addMember(groupId, req.userId);
        res.json({ success: true });
        
    } catch (err) {
        winston.error('Join group error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const leaveGroup = async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        if (group.creator_id === req.userId) {
            return res.status(400).json({ error: 'Создатель не может выйти из группы' });
        }
        
        await Group.removeMember(groupId, req.userId);
        res.json({ success: true });
        
    } catch (err) {
        winston.error('Leave group error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const deleteGroup = async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const deleted = await Group.delete(groupId, req.userId);
        
        if (!deleted) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        res.json({ success: true });
        
    } catch (err) {
        winston.error('Delete group error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

module.exports = {
    getGroups,
    createGroup,
    joinGroup,
    leaveGroup,
    deleteGroup
};
