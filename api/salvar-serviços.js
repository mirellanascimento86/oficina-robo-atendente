// api/salvar-servicos.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { servicos } = req.body;
  const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY;
 
  await fetch(`${SB}/rest/v1/servicos?id=gte.0`, {
    method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
 
  if (servicos && servicos.length > 0) {
    await fetch(`${SB}/rest/v1/servicos`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(servicos)
    });
  }
 
  return res.status(200).json({ ok: true });
}
