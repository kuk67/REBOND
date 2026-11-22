const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Константы для удобства поддержки
const FILE_NAME = 'Les 7 Erreurs Mortelles Post-Rupture.pdf';
const BUCKET_NAME = 'private-files';

exports.handler = async (event) => {
  // Добавляем CORS заголовки для работы с фронтендом
  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // В продакшене лучше указать конкретный домен
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Обработка Preflight запроса (CORS)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: jsonHeaders };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Метод не разрешен' }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey || !resendApiKey) {
    console.error('Ошибка: Отсутствуют переменные окружения');
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Конфигурация сервера не готова' }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const resend = new Resend(resendApiKey);

  let email;
  try {
    const body = JSON.parse(event.body || '{}');
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch (parseError) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Некорректный формат JSON' }),
    };
  }

  // Простая валидация email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Некорректный адрес электронной почты' }),
    };
  }

  try {
    // 1. Сохранение/Обновление в БД
    const { error: dbError } = await supabase
      .from('subscribers')
      .upsert({ email }, { onConflict: 'email' });

    if (dbError) {
      console.error('DB Error:', dbError);
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Ошибка при сохранении данных' }),
      };
    }

    // 2. Генерация временной ссылки на файл
    // Срок действия 3600 секунд (1 час)
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from(BUCKET_NAME)
      .createSignedUrl(FILE_NAME, 3600);

    if (signedError || !signedData?.signedUrl) {
      console.error('Storage Error:', signedError);
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Не удалось подготовить файл к загрузке' }),
      };
    }

    // 3. Отправка письма
    const { data: sentData, error: emailError } = await resend.emails.send({
      from: 'REBOND <onboarding@resend.dev>', // Замените на ваш подтвержденный домен в продакшене
      to: [email],
      subject: 'Ton Guide Gratuit : Les 7 Erreurs Mortelles',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <h2 style="color: #333;">Bonjour,</h2>
          <p>Merci de votre confiance. Voici votre guide gratuit pour vous aider à préserver votre sérénité.</p>
          <p>Cliquez sur le bouton ci-dessous pour le télécharger :</p>
          <div style="margin: 30px 0;">
            <a href="${signedData.signedUrl}"
               style="background-color: #d4af37; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 18px;">
               Télécharger le Guide PDF
            </a>
          </div>
          <p>Prenez soin de vous,<br>L'équipe REBOND</p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Resend Error:', emailError);
      // Даже если почта не ушла, данные в БД уже есть. 
      // Можно вернуть 200 с предупреждением или оставить 500.
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Данные сохранены, но письмо не было отправлено' }),
      };
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        message: 'Succès ! Vérifiez votre boîte mail.',
        id: sentData?.id,
      }),
    };
  } catch (err) {
    console.error('Critical Function Error:', err);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Erreur interne du serveur' }),
    };
  }
};
