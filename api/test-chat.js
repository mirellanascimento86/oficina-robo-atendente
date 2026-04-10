export default async function handler(req, res) {
  try {
    const { mensagem } = req.body;

    // BUSCA TREINAMENTO
    const config = await fetch(process.env.SUPABASE_URL + '/rest/v1/treinamento?id=eq.1', {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    }).then(r => r.json());

    const treinamento = config?.[0]?.conteudo || "Você é uma atendente simpática.";

    // CHAMA GROQ
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

    res.status(200).json({
      resposta: dados.choices?.[0]?.message?.content || "Erro na IA"
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ resposta: "Erro no servidor" });
  }
}
