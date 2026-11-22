const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Ключи подтянутся из настроек Netlify (которые мы добавили ранее)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Метод не разрешен' })
    };
  }

  try {
    const { email } = JSON.parse(event.body);

    if (!email || !email.includes('@')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Некорректный email' })
      };
    }

    // 1. Сохраняем email в базу данных Supabase
    const { error: dbError } = await supabase
      .from('subscribers')
      .upsert({ email });

    if (dbError) {
      console.error('Ошибка базы данных:', dbError);
      // Продолжаем, даже если email уже существует
    }

    // 2. Отправляем письмо через Resend
    // ВНИМАНИЕ: Замени ССЫЛКА_НА_ФАЙЛ на прямую ссылку из твоего Supabase Storage
    const emailData = await resend.emails.send({
      from: 'REBOND <onboarding@resend.dev>', // В будущем замени на свой домен
      to: [email],
      subject: 'Ton Guide Gratuit : Les 7 Erreurs Mortelles',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <h2 style="color: #333;">Bonjour,</h2>
          <p>Merci de votre confiance. Voici votre guide gratuit pour vous aider à préserver votre sérénité.</p>
          <p>Cliquez sur le bouton ci-dessous pour le télécharger :</p>
          <div style="margin: 30px 0;">
            <a href="ССЫЛКА_НА_ФАЙЛ_В_SUPABASE" 
               style="background-color: #d4af37; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 18px;">
               Télécharger le Guide PDF
            </a>
          </div>
          <p>Prenez soin de vous,<br>L'équipe REBOND</p>
        </div>
      `,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Succès ! Vérifiez votre boîte mail.' })
    };

  } catch (err) {
    console.error('Ошибка функции:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erreur interne' })
    };
  }
};

