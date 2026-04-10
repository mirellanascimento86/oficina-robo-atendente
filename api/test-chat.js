export default async function handler(req, res) {
  const { mensagem } = req.body;

  try {
    const configRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });
    const config = await configRes.json();

    const systemPrompt = `
Você é um atendente profissional da RC Construção e Reforma.
Personalidade: ${config[0]?.personalidade || 'educado, rápido e simpático'}
Scripts: ${config[0]?.scripts || ''}
Regras: ${config[0]?.regras || 'Sempre seja útil e conduza para agendamento de visita'}

Responda de forma natural, como uma pessoa real no WhatsApp.
`;

    const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://oficina-robo-atendente.vercel.app',
        'X-Title': 'Oficina IA'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',   // modelo gratuito e bom
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: mensagem }
        ]
      })
    });

    const data = await openrouterRes.json();

    const resposta = data.choices?.[0]?.message?.content || "Desculpe, estou com dificuldade técnica. Pode repetir?";

    res.json({ resposta });

  } catch (error) {
    console.error("Erro OpenRouter:", error);
    res.json({ resposta: "Desculpe, estou com dificuldade técnica no momento. Pode repetir?" });
  }
}
