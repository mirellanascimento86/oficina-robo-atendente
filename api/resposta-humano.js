export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { telefone, mensagem } = req.body;
  const SUPABASE_URL = 'https://ehpikmqrieldplwkmyyo.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // você vai configurar no Vercel

  // Salva no histórico
  await fetch(`${SUPABASE_URL}/rest/v1/historico`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      telefone,
      mensagem,
      origem: 'humano'
    })
  });

  await enviarWhatsApp(telefone, mensagem);

  // Envia no WhatsApp
  await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_ID_NUMERO}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'text',
      text: { body: mensagem }
    })
  });

  res.json({ sucesso: true });
}
