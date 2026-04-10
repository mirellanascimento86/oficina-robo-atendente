export default async function handler(req, res) {
  if (req.method === 'GET') {
    const VERIFY_TOKEN = 'oficina123token';
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Token inválido');
  }

  if (req.method !== 'POST') return res.status(405).end();

  res.status(200).json({ status: 'ok' });

  try {
    await processarMensagem(req.body);
  } catch (erro) {
    console.error('Erro no webhook:', erro);
  }
}

async function processarMensagem(body) {
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return;

  const telefone = message.from;
  const texto = message.text?.body || '';

  // Carrega o que você salvou no treinamento
  const configRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config`, {
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    }
  });
  const config = await configRes.json();
  const personalidade = config[0]?.personalidade || '';
  const scripts = config[0]?.scripts || '';
  const regras = config[0]?.regras || '';

  const prompt = `
Você é atendente da RC Construção e Reforma.
Personalidade: ${personalidade}
Scripts: ${scripts}
Regras obrigatórias: ${regras}

Responda de forma natural como humana.
Se não souber responder ou for algo complexo, diga: "Vou chamar minha supervisora para te ajudar melhor."
`;

  // Chama Groq
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: texto }
      ],
      temperature: 0.7
    })
  });

  const groqData = await groqRes.json();
  const resposta = groqData.choices?.[0]?.message?.content || "Oi! Recebi sua mensagem e já te respondo.";

  // Envia para o cliente
  await enviarWhatsApp(telefone, resposta);
}

async function enviarWhatsApp(telefone, mensagem) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_ID_NUMERO}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'text',
      text: { body: mensagem }
    })
  });
}
