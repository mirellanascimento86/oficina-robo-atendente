// api/resposta-humano.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { telefone, mensagem } = req.body;
  const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY;
 
  // Salva no histórico
  await fetch(`${SB}/rest/v1/historico`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ telefone, mensagem, origem: 'humano', data: new Date().toISOString() })
  });
 
  // Envia no WhatsApp
  const waRes = await fetch(
    `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefone,
        type: 'text',
        text: { body: mensagem }
      })
    }
  );
 
  if (!waRes.ok) {
    const err = await waRes.text();
    console.error('WA send error:', err);
    return res.status(500).json({ error: err });
  }
 
  return res.status(200).json({ ok: true });
}
