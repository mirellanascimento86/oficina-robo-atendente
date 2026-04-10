export default async function handler(req, res) {
  if (req.method === 'GET') {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    await processarMensagem(req.body);
    return res.status(200).json({ status: 'ok' });
  } catch (erro) {
    console.error('Erro no webhook:', erro);
    return res.status(500).json({ error: 'erro interno' });
  }
}

async function processarMensagem(body) {
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return;

  const telefone = message.from;
  const texto = message.text?.body || (message.type ? `[${message.type}]` : '');

  // Salva mensagem do cliente
  await salvarHistorico(telefone, texto, 'cliente');

  // Carrega configurações do treinamento
  const configRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config`, {
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    }
  });
  const config = await configRes.json();

  const personalidade = config[0]?.personalidade || 'educado e rápido';
  const scripts = config[0]?.scripts || '';
  const regras = config[0]?.regras || 'Seja simpático e conduza para agendamento';

  const systemPrompt = `
Você é Maria, atendente humana da RC Construção e Reforma.
Personalidade: ${personalidade}
Scripts: ${scripts}
Regras: ${regras}

Fale como uma pessoa real: use emojis, seja natural, rápida e com jogo de cintura.
Se o cliente reclamar, seja empático e ofereça solução.
Se precisar negociar valor, seja flexível mas não baixe demais sem autorização.
Se não souber responder, diga: "Vou chamar minha supervisora para te ajudar melhor."
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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: texto }
      ],
      temperature: 0.75
    })
  });

  const groqData = await groqRes.json();
  let resposta = groqData.choices?.[0]?.message?.content || "Oi! Recebi sua mensagem e já te respondo.";

  // Envia para o cliente
  await enviarWhatsApp(telefone, resposta);

  // Salva resposta do robô
  await salvarHistorico(telefone, resposta, 'robo');
}

async function salvarHistorico(telefone, mensagem, origem) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/historico`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ telefone, mensagem, origem, data: new Date().toISOString() })
  });
}

async function enviarWhatsApp(telefone, mensagem) {
  try {
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
    console.log('Mensagem enviada para', telefone);
  } catch (e) {
    console.error('Erro ao enviar WhatsApp:', e);
  }
}
