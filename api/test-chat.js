export default async function handler(req, res) {
  const { mensagem } = req.body;
  const SUPABASE_URL = 'https://ehpikmqrieldplwkmyyo.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  // Carrega as instruções salvas
  const configRes = await fetch(`${SUPABASE_URL}/rest/v1/config`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const config = await configRes.json();

  const systemPrompt = `
Você é um atendente de oficina de refrigeração, máquina de lavar e marcenaria.
Personalidade: ${config[0]?.personalidade || 'educado e rápido'}
Scripts: ${config[0]?.scripts || ''}
Regras: ${config[0]?.regras || ''}
Responda de forma natural, como uma conversa humana.
`;

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensagem }
      ],
      temperature: 0.7,
      max_tokens: 500
    })
  });

  const data = await groqRes.json();
  res.json({ resposta: data.choices[0].message.content });
}
