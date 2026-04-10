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
  const config = await fetch(process.env.SUPABASE_URL + '/rest/v1/treinamento?id=eq.1', {
  headers: {
    apikey: process.env.SUPABASE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_KEY}`
  }
}).then(r => r.json());

const treinamento = config?.[0]?.conteudo || '';
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

    const config = await fetch(process.env.SUPABASE_URL + '/rest/v1/config?id=eq.1', {
  headers: {
    apikey: process.env.SUPABASE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_KEY}`
  }
}).then(r => r.json());

const personalidade = config?.[0]?.personalidade || '';
const scripts = config?.[0]?.scripts || '';
const regras = config?.[0]?.regras || '';
    
    const prompt = `
${treinamento}

Você é Maria, atendente especialista de uma oficina.

OBJETIVO PRINCIPAL:
→ Converter clientes em visitas técnicas

COMPORTAMENTO:
- Fale como humana (nunca diga que é IA)
- Seja simpática, natural e rápida
- Use linguagem simples (WhatsApp real)
- Demonstre interesse genuíno

PROCESSO DE ATENDIMENTO:
1. Entender o problema
2. Pedir bairro
3. Pedir foto (se possível)
4. Oferecer visita
5. Tentar fechar agendamento

REGRAS:
- Nunca dar preço sem bairro
- Nunca enrolar
- Sempre conduzir para agendamento
- Se cliente travar → chamar supervisora

DECISÃO:
Se não souber responder OU cliente pedir humano:
→ diga: "vou chamar minha supervisora pra te ajudar melhor"

CLIENTE: ${nomeCliente}
MENSAGEM: ${mensagemCliente}
`;

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
