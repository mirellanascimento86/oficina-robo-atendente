// api/historico.js
export default async function handler(req, res) {
  const { telefone } = req.query;
  if (!telefone) return res.status(400).json({ error: 'telefone obrigatorio' });
 
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/historico?telefone=eq.${telefone}&order=data.asc&limit=100`,
    { headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` } }
  );
  return res.status(200).json(await r.json() || []);
}
 
