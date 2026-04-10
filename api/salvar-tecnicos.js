// api/salvar-tecnicos.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { tecnicos } = req.body;
  const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY;
 
  // Apaga todos e reinserere
  await fetch(`${SB}/rest/v1/tecnicos?id=gte.0`, {
    method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
 
  if (tecnicos && tecnicos.length > 0) {
    await fetch(`${SB}/rest/v1/tecnicos`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(tecnicos)
    });
  }
 
  return res.status(200).json({ ok: true });
}
 
