// WEBHOOK WHATSAPP - FUNCIONAL
export default async function handler(req, res) {
  // VERIFICAÇÃO META (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === 'oficina123token') {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Falha');
  }
  
  // RECEBER MENSAGENS (POST)
  if (req.method === 'POST') {
    // Responde imediatamente
    res.status(200).json({ status: 'ok' });
    
    // Processa em background
    processarMensagem(req.body).catch(console.error);
    return;
  }
  
  return res.status(405).send('Não permitido');
}

async function processarMensagem(body) {
  try {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;
    
    const telefone = message.from;
    const nome = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || 'Cliente';
    const texto = message.text?.body || '';
    const tipo = message.type;
    
    console.log(`📩 ${nome}: ${texto || '['+tipo+']'}`);
    
    // Se não tem config do WhatsApp, loga erro
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_ID_NUMERO) {
      console.error('❌ WHATSAPP_TOKEN ou WHATSAPP_ID_NUMERO não configurado!');
      return;
    }
    
    // Se é mídia
    if (tipo !== 'text') {
      await enviarWhatsApp(telefone, `Recebi seu ${tipo}. Deixa eu ver aqui... 📎`);
      return;
    }
    
    // Resposta com IA ou simples
    let resposta = '';
    
    if (process.env.GROQ_API_KEY) {
      // Tenta usar IA
      try {
        resposta = await chamarGroq(texto, nome);
      } catch (e) {
        console.log('Erro Groq, usando resposta padrão');
        resposta = respostaPadrao(texto, nome);
      }
    } else {
      // Sem IA, resposta padrão
      resposta = respostaPadrao(texto, nome);
    }
    
    await enviarWhatsApp(telefone, resposta);
    console.log('✅ Resposta enviada');
    
  } catch (erro) {
    console.error('Erro processando:', erro);
  }
}

// RESPOSTAS PADRÃO (sem IA)
function respostaPadrao(texto, nome) {
  const t = texto.toLowerCase();
  
  if (t.includes('oi') || t.includes('olá') || t.includes('ola')) {
    return `Olá ${nome}! 👋 Sou a Maria, atendente virtual.\n\nPosso ajudar com:\n• 🔧 Refrigeração\n• 🧺 Máquina de lavar\n• 🪚 Marcenaria\n\nQual serviço você precisa?`;
  }
  
  if (t.includes('preço') || t.includes('preco') || t.includes('valor') || t.includes('quanto')) {
    return `Os valores dependem do bairro, ${nome}! 📍\n\n• Visita técnica: R$ 50-80\n• Orçamento: GRÁTIS na visita\n• Conserto: após avaliação\n\nQual seu bairro?`;
  }
  
  if (t.includes('geladeira') || t.includes('freezer') || t.includes('frio')) {
    return `Perfeito! Para refrigeração, qual seu bairro? Assim já te passo o valor exato da visita! ❄️`;
  }
  
  if (t.includes('máquina') || t.includes('lavar')) {
    return `Entendido! Máquina de lavar. Qual seu bairro? 🧺`;
  }
  
  if (t.includes('marcenaria') || t.includes('móvel') || t.includes('porta')) {
    return `Marcenaria! 🪚 Qual seu bairro para eu consultar o valor da visita?`;
  }
  
  if (t.includes('centro') || t.includes('jardim') || t.includes('vila') || t.includes('bairro')) {
    return `✅ ${texto} - Visita: R$ 60,00\n\nTem disponibilidade:\n• Amanhã manhã (8h-12h)\n• Amanhã tarde (14h-18h)\n• Sábado\n\nQual prefere?`;
  }
  
  if (t.includes('amanhã') || t.includes('sabado') || t.includes('sábado')) {
    return `Ótimo! 📅 ${texto} anotado.\n\nPreciso do endereço completo (rua, número) para enviar ao técnico:`;
  }
  
  // Resposta genérica
  return `Entendi, ${nome}! 🤔\n\nPara te ajudar melhor, me diz:\n1️⃣ Qual serviço precisa?\n2️⃣ Qual seu bairro?\n\nAssim já passo o valor e disponibilidade!`;
}

// CHAMA GROQ IA
async function chamarGroq(mensagem, nome) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        {
          role: 'system',
          content: `Você é Maria, atendente simpática de oficina técnica. 
Serviços: Refrigeração, Máquina de Lavar, Marcenaria.
Sempre peça bairro antes de dar preço. Visita custa R$ 50-80.
Seja persuasiva para fechar agendamento.`
        },
        {
          role: 'user',
          content: `Cliente ${nome} disse: "${mensagem}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    })
  });
  
  const dados = await res.json();
  return dados.choices[0].message.content;
}

// ENVIA WHATSAPP
async function enviarWhatsApp(telefone, mensagem) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_ID_NUMERO}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
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
  if (dados.error) {
    console.error('Erro WhatsApp:', dados.error);
  }
  return dados;
}
