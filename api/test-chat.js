export default async function handler(req, res) {
  try {
    const { mensagem } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.json({ resposta: "❌ GROQ_API_KEY não configurada" });
    }

    // busca treinamento
    const config = await fetch(process.env.SUPABASE_URL + '/rest/v1/treinamento?id=eq.1', {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    }).then(r => r.json());

    const treinamento = config?.[0]?.conteudo || "Você é uma atendente.";

    const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: treinamento },
          { role: 'user', content: mensagem }
        ]
      })
    });

    const dados = await resposta.json();

    res.json({
      resposta: dados.choices?.[0]?.message?.content || "Erro na resposta da IA"
    });

  } catch (e) {
    console.error(e);
    res.json({ resposta: "Erro no servidor" });
  }
}
