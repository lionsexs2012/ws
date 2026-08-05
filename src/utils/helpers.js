const { v4: uuidv4 } = require('uuid');

const generateId = () => uuidv4();

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const formatDate = (date) => {
    return new Date(date).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const truncateText = (text, maxLength = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

const getPagination = (page = 1, limit = 20) => {
    const offset = (page - 1) * limit;
    return { limit, offset };
};

const sanitizeInput = (text) => {
    return text.replace(/[<>]/g, '');
};

module.exports = {
    generateId,
    generateVerificationCode,
    formatDate,
    truncateText,
    getPagination,
    sanitizeInput
};
