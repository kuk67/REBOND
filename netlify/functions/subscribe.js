const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  const jsonHeaders = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Метод не разрешен' }),
    };
  }

  let email;
  try {
    const body = JSON.parse(event.body || '{}');
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch (parseError) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Некорректный JSON' }),
    };
  }

  if (!email || !email.includes('@')) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Некорректный email' }),
    };
  }

  try {
    const { error: dbError } = await supabase
      .from('subscribers')
      .upsert({ email }, { onConflict: 'email' });

    if (dbError) {
      console.error('Ошибка базы данных:', dbError);
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Ошибка сохранения email' }),
      };
    }

    const { data: signedData, error: signedError } = await supabase
      .storage
      .from('private-files')
      .createSignedUrl('Les 7 Erreurs Mortelles Post-Rupture.pdf', 3600);

    if (signedError || !signedData || !signedData.signedUrl) {
      console.error('Ошибка генерации ссылки:', signedError);
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Ошибка генерации ссылки на файл' }),
      };
    }

    const { data: sentData, error: emailError } = await resend.emails.send({
      from: 'REBOND <onboarding@resend.dev>',
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
      console.error('Ошибка отправки письма:', emailError);
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Ошибка отправки письма' }),
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
    console.error('Ошибка функции:', err);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Erreur interne' }),
    };
  }
};
