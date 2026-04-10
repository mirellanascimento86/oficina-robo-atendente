// api/salvar-config.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { personalidade, scripts, regras } = req.body;
  const SB = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_KEY;
 
  // Verifica se já existe registro
  const check = await fetch(`${SB}/rest/v1/config?select=id&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  const existing = await check.json();
 
  if (existing && existing.length > 0) {
    await fetch(`${SB}/rest/v1/config?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ personalidade, scripts, regras })
    });
  } else {
    await fetch(`${SB}/rest/v1/config`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ personalidade, scripts, regras })
    });
  }
 
  return res.status(200).json({ ok: true });
}
