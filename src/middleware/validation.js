const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

const validatePassword = (password) => {
    return password && password.length >= 6;
};

const validateLogin = (login) => {
    return login && login.length >= 3 && login.length <= 50;
};

const validateText = (text, min = 1, max = 5000) => {
    return text && text.length >= min && text.length <= max;
};

const validateId = (id) => {
    return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

module.exports = {
    validateEmail,
    validatePassword,
    validateLogin,
    validateText,
    validateId
};
