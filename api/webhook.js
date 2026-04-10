export default async function handler(req, res) {
  // Verificação do Meta (GET)
  if (req.method === 'GET') {
    const VERIFY_TOKEN = 'oficina123token';
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Token inválido');
  }

  if (req.method !== 'POST') return res.status(405).end();

  // Responde imediatamente para o Meta
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
  const texto = message.text?.body || (message.type !== 'text' ? `[${message.type}]` : '');

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
  const personalidade = config[0]?.personalidade || '';
  const scripts = config[0]?.scripts || '';
  const regras = config[0]?.regras || '';

  const prompt = `
Você é atendente da RC Construção e Reforma.
Personalidade: ${personalidade}
Scripts: ${scripts}
Regras obrigatórias: ${regras}

Responda de forma natural, como uma humana simpática e rápida.
Se não souber responder ou for algo complexo, responda exatamente: "Vou chamar minha supervisora para te ajudar melhor."
`;

async function chamarGroq(mensagemCliente, nomeCliente) {
  try {
    const configRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });
    const config = await configRes.json();

    const systemPrompt = `
Você é atendente da RC Construção e Reforma.
Personalidade: ${config[0]?.personalidade || ''}
Scripts: ${config[0]?.scripts || ''}
Regras: ${config[0]?.regras || ''}

Responda de forma natural como humana.
`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://oficina-robo-atendente.vercel.app',
        'X-Title': 'Oficina IA'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: mensagemCliente }
        ]
      })
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || `Oi ${nomeCliente}! Recebi sua mensagem.`;

  } catch (erro) {
    console.error('Erro OpenRouter:', erro);
    return `Oi! Recebi sua mensagem e já te respondo.`;
  }
}

  const groqData = await groqRes.json();
  let resposta = groqData.choices?.[0]?.message?.content || "Oi! Recebi sua mensagem e já te respondo.";

  // Verifica se precisa de intervenção
  const precisaIntervencao = resposta.toLowerCase().includes("supervisora") || resposta.toLowerCase().includes("não sei");

  if (precisaIntervencao) {
    resposta = resposta.replace("Vou chamar minha supervisora para te ajudar melhor.", "").trim();
    await avisarHumano(telefone, texto, resposta);
  }

  // Envia resposta para o cliente
  await enviarWhatsApp(telefone, resposta);

  // Salva resposta do robô
  await salvarHistorico(telefone, resposta, 'robo');
}

// Salva no histórico
async function salvarHistorico(telefone, mensagem, origem) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/historico`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ telefone, mensagem, origem })
  });
}

// Envia mensagem pelo WhatsApp
async function enviarWhatsApp(telefone, mensagem) {
  await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_ID_NUMERO}/messages`, {
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

// Notifica no Telegram
async function avisarHumano(telefone, mensagemCliente, respostaRobo) {
  const texto = `🚨 INTERVENÇÃO NECESSÁRIA\n\n📱 Cliente: ${telefone}\n💬 Mensagem: ${mensagemCliente}\n🤖 Robô disse: ${respostaRobo}\n\nAcesse: https://oficina-robo-atendente.vercel.app/intervencao.html`;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: texto
    })
  });
}
