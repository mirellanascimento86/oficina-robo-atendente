// api/carregar-bairros.js
export default async function handler(req, res) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bairros?select=*`, {
    headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` }
  });
  return res.status(200).json(await r.json() || []);
}
