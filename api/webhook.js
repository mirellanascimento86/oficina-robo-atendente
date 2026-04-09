// WEBHOOK WHATSAPP - VERSÃO FUNCIONAL COM GROQ IA
export default async function handler(req, res) {
  // ===== VERIFICAÇÃO DO META (GET) =====
  if (req.method === 'GET') {
  const { query } = req;
  
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  console.log('GET recebido RAW:', req.url);
  console.log('GET recebido PARSED:', { mode, token, challenge });

  const VERIFY_TOKEN = 'oficina123token';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Verificado!');
    return res.status(200).send(challenge);
  }

  console.log('❌ Falhou:', { mode, token });
  return res.status(403).send('Falha na verificação');
}
  
  // ===== RECEBER MENSAGENS (POST) =====
  if (req.method === 'POST') {
    console.log('POST recebido');
    
    // Responde imediatamente pro Meta (evita timeout)
    res.status(200).json({ status: 'ok' });
    
    // Processa em background
    try {
      await processarMensagem(req.body);
    } catch (erro) {
      console.error('Erro processando:', erro);
    }
    
    return;
  }
  
  return res.status(405).send('Method not allowed');
}

// PROCESSA MENSAGEM COM IA GROQ
async function processarMensagem(body) {
  console.log('BODY COMPLETO:', JSON.stringify(body, null, 2));
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return;
  
  const telefone = message.from;
  const nome = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || 'Cliente';
  const texto = message.text?.body || '';
  const tipo = message.type;
  
  console.log(`📩 ${nome} (${telefone}): ${texto || '[' + tipo + ']'}`);
  
  // Se é mídia, avisa humano
  if (tipo !== 'text') {
    await enviarWhatsApp(telefone, `Recebi seu ${tipo}. Vou analisar e já respondo! 📎`);
    await avisarHumano(nome, `Enviou ${tipo}`, telefone);
    return;
  }
  
  // CHAMA IA GROQ
  const respostaIA = await chamarGroq(texto, nome);
  
  // Envia resposta
  await enviarWhatsApp(telefone, respostaIA);
  
  // Se pediu ajuda, avisa humano
  if (respostaIA.includes('supervisora') || respostaIA.includes('não sei')) {
    await avisarHumano(nome, texto, telefone);
  }
}

// CHAMA API GROQ (IA GRATUITA)
async function chamarGroq(mensagemCliente, nomeCliente) {
  try {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    if (!GROQ_API_KEY) {
      return `Olá ${nomeCliente}! 👋 Recebi sua mensagem. Estou configurando minha inteligência, mas já já respondo direitinho!`;
    }
    
    const prompt = `Você é Maria, atendente experiente e simpática de uma oficina técnica.
    
SERVIÇOS: Refrigeração, Máquina de Lavar, Marcenaria.

REGRAS:
- Sempre pergunte o bairro antes de dar preço
- Visita custa R$ 50-80 (depende do bairro)
- Orçamento é grátis na visita
- Peça foto do defeito
- Ofereça datas: amanhã manhã/tarde ou sábado
- Seja persuasiva para fechar a visita
- Se não souber, diga que vai chamar supervisora

CLIENTE: ${nomeCliente}
MENSAGEM: "${mensagemCliente}"

Responda como Maria, atendente humana:`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: mensagemCliente }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });
    
    const dados = await res.json();
    return dados.choices?.[0]?.message?.content || `Oi ${nomeCliente}! Vou verificar isso e já te respondo.`;
    
  } catch (erro) {
    console.error('Erro Groq:', erro);
    return `Oi ${nomeCliente}! 👋 Sou a Maria. Recebi sua mensagem e já já te respondo com todos os detalhes!`;
  }
}

// ENVIA MENSAGEM WHATSAPP
async function enviarWhatsApp(telefone, mensagem) {
  try {
    const TOKEN = process.env.WHATSAPP_TOKEN;
    const ID_NUMERO = process.env.WHATSAPP_ID_NUMERO;
    
    if (!TOKEN || !ID_NUMERO) {
      console.log('❌ Variáveis do WhatsApp não configuradas');
      return;
    }
    
    const res = await fetch(`https://graph.facebook.com/v18.0/${ID_NUMERO}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefone,
        type: 'text',
        text: { body: mensagem }
      })
    });
    
    const dados = await res.json();
    console.log('✅ Enviado:', dados.messages?.[0]?.id);
    
  } catch (erro) {
    console.error('❌ Erro ao enviar:', erro);
  }
}

// AVISA HUMANO NO TELEGRAM
async function avisarHumano(nome, mensagem, telefone) {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    
    if (!BOT_TOKEN || !CHAT_ID) return;
    
    const texto = `🆘 PRECISA DE AJUDA\n\n👤 ${nome}\n📱 ${telefone}\n💬 ${mensagem.substring(0, 100)}\n\n👉 https://oficina-robo-atendente.vercel.app/intervencao?telefone=${telefone}`;
    
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: texto,
        parse_mode: 'Markdown'
      })
    });
    
  } catch (erro) {
    console.error('Erro Telegram:', erro);
  }
}
