// api/carregar-config.js
export default async function handler(req, res) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config?select=*&limit=1`, {
    headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` }
  });
  const d = await r.json();
  return res.status(200).json(d?.[0] || {});
}
 
