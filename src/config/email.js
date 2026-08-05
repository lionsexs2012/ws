const nodemailer = require('nodemailer');
const winston = require('winston');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

const testEmail = async () => {
    try {
        await transporter.verify();
        winston.info('✅ Email сервер готов');
        return true;
    } catch (err) {
        winston.error('❌ Email сервер не доступен:', err.message);
        return false;
    }
};

const sendEmail = async (to, subject, html) => {
    try {
        const info = await transporter.sendMail({
            from: `"WOND" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        winston.info(`📧 Email отправлен: ${to}`);
        return { success: true, info };
    } catch (err) {
        winston.error('❌ Ошибка отправки email:', err);
        return { success: false, error: err.message };
    }
};

const sendVerificationEmail = async (email, code) => {
    const html = `
        <h1>Подтверждение email в WOND</h1>
        <p>Ваш код подтверждения: <strong>${code}</strong></p>
        <p>Код действителен 15 минут.</p>
    `;
    return sendEmail(email, '🔐 Подтверждение email в WOND', html);
};

const sendWelcomeEmail = async (email, login) => {
    const html = `
        <h1>Добро пожаловать в WOND, ${login}!</h1>
        <p>Ваш email подтверждён. Теперь вы можете пользоваться всеми возможностями.</p>
        <a href="${process.env.CORS_ORIGIN}">Перейти в WOND</a>
    `;
    return sendEmail(email, '🎉 Добро пожаловать в WOND!', html);
};

module.exports = { 
    transporter, 
    sendEmail, 
    testEmail, 
    sendVerificationEmail, 
    sendWelcomeEmail 
};
