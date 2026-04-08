// ROBÔ INTELIGENTE - Busca respostas no banco de dados
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    
    if (!message) return res.status(200).json({ status: 'ignorado' });

    const telefone = message.from;
    const nome = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || 'Cliente';
    const texto = message.text?.body?.toLowerCase() || '';
    const tipoMidia = message.type; // text, image, audio, video

    // Busca respostas cadastradas no Supabase
    const respostas = await buscarRespostas();
    
    // Procura palavra-chave na mensagem
    let resposta = await encontrarMelhorResposta(texto, respostas);
    
    // Se não encontrou ou é mídia, pede ajuda
    if (!resposta || tipoMidia !== 'text') {
      await salvarIntervencao(telefone, nome, texto, tipoMidia);
      await avisarTelegram(nome, texto, telefone);
      
      resposta = `Olá ${nome}! 👋\n\nRecebi sua mensagem, mas preciso confirmar alguns detalhes com minha supervisora. Ela já foi avisada e vai te responder em breve! ⏳`;
    }

    await enviarWhatsApp(telefone, resposta);
    res.status(200).json({ sucesso: true });

  } catch (erro) {
    console.error('Erro:', erro);
    res.status(200).json({ status: 'erro' });
  }
}

// Busca respostas do Supabase
async function buscarRespostas() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/respostas?select=*`;
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
    }
  });
  return res.json();
}

// Encontra resposta que contém palavras da mensagem
async function encontrarMelhorResposta(texto, respostas) {
  // Procura palavras-chave
  for (const item of respostas) {
    const palavras = item.palavras_chave.toLowerCase().split(',');
    if (palavras.some(p => texto.includes(p.trim()))) {
      return item.resposta;
    }
  }
  return null; // Não encontrou
}

// Avisa no Telegram
async function avisarTelegram(nome, mensagem, telefone) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  
  const texto = `🚨 *NOVO CHAMADO*\n\n👤 *${nome}*\n📱 ${telefone}\n💬 "${mensagem}"\n\n👉 Acesse: https://seu-projeto.vercel.app/intervencao`;
  
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: texto,
      parse_mode: 'Markdown'
    })
  });
}

// Salva para intervenção
async function salvarIntervencao(telefone, nome, mensagem, tipo) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/intervencoes`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      telefone,
      nome,
      mensagem,
      tipo_midia: tipo,
      status: 'pendente',
      data: new Date().toISOString()
    })
  });
}

async function enviarWhatsApp(telefone, mensagem) {
  // ... mesmo código de antes
}
