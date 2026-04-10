export default async function handler(req, res) {
  const { mensagem } = req.body;

  if (!mensagem) {
    return res.status(400).json({ resposta: "Mensagem vazia" });
  }

  try {
    // Carrega as configurações que você salvou no treinamento
    const configRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });

    const config = await configRes.json();
    const personalidade = config[0]?.personalidade || 'educado e rápido';
    const scripts = config[0]?.scripts || '';
    const regras = config[0]?.regras || '';

    const systemPrompt = `
Você é um atendente profissional da RC Construção e Reforma.
Personalidade: ${personalidade}
Scripts: ${scripts}
Regras: ${regras}

Responda de forma natural, simpática e direta, como uma pessoa real no WhatsApp.
`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
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

    if (!data.choices || !data.choices[0]) {
      throw new Error("Resposta inválida do Groq");
    }

    res.json({ resposta: data.choices[0].message.content });

  } catch (error) {
    console.error("Erro no test-chat:", error);
    res.json({ resposta: "Desculpe, estou com dificuldade técnica no momento. Pode repetir?" });
  }
}
