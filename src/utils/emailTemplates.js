const verificationTemplate = (code) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #4a76a8, #6c5ce7); padding: 30px; text-align: center; border-radius: 20px 20px 0 0; }
        .header h1 { color: white; font-size: 32px; margin: 0; }
        .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e8ecf0; border-radius: 0 0 20px 20px; }
        .code-box { background: #f0f4f8; padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0; }
        .code { font-size: 32px; font-weight: 700; letter-spacing: 10px; color: #4a76a8; }
        .footer { text-align: center; color: #7a8a9a; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔐 WOND</h1>
        <p>Подтверждение email</p>
    </div>
    <div class="content">
        <h2>Здравствуйте!</h2>
        <p>Вы зарегистрировались в социальной сети <strong>WOND</strong>.</p>
        <p>Для подтверждения вашего email введите код ниже:</p>
        <div class="code-box">
            <span class="code">${code}</span>
        </div>
        <p>Код действителен в течение 15 минут.</p>
        <p>Если вы не регистрировались в WOND, просто проигнорируйте это письмо.</p>
        <hr />
        <div class="footer">
            © 2026 WOND — Социальная сеть нового поколения<br />
            CEO: LEV USKOV
        </div>
    </div>
</body>
</html>
`;

const welcomeTemplate = (login) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #4a76a8, #6c5ce7); padding: 30px; text-align: center; border-radius: 20px 20px 0 0; }
        .header h1 { color: white; font-size: 32px; margin: 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e8ecf0; border-radius: 0 0 20px 20px; }
        .btn { display: inline-block; background: linear-gradient(135deg, #4a76a8, #6c5ce7); color: white; padding: 14px 40px; border-radius: 30px; text-decoration: none; font-weight: 600; margin: 20px 0; }
        .footer { text-align: center; color: #7a8a9a; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 WOND</h1>
        <p>Добро пожаловать!</p>
    </div>
    <div class="content">
        <h2>Добро пожаловать, ${login}!</h2>
        <p>Ваш аккаунт в социальной сети <strong>WOND</strong> успешно подтверждён!</p>
        <p>Теперь вы можете:</p>
        <ul>
            <li>📰 Публиковать посты на стене</li>
            <li>👥 Создавать группы до 100 человек</li>
            <li>🤝 Добавлять друзей</li>
            <li>📞 Совершать аудио- и видеозвонки</li>
        </ul>
        <div style="text-align: center;">
            <a href="${process.env.CORS_ORIGIN || 'https://wond.onrender.com'}" class="btn">Перейти в WOND</a>
        </div>
        <hr />
        <div class="footer">
            © 2026 WOND — Социальная сеть нового поколения<br />
            CEO: LEV USKOV
        </div>
    </div>
</body>
</html>
`;

module.exports = { verificationTemplate, welcomeTemplate };
