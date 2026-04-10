export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { personalidade, scripts, regras } = req.body;

  const supabaseUrl = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !apiKey) {
    return res.status(500).json({ error: "Missed envs" });
  }

  const result = await fetch(`${supabaseUrl}/rest/v1/config`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      personalidade,
      scripts,
      regras
    })
  });

  if (result.ok) {
    return res.status(200).json({ ok: true });
  } else {
    const error = await result.text();
    return res.status(500).json({ error });
  }
}
