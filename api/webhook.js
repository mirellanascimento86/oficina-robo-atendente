// ROBÔ DO WHATSAPP - RODA NA VERCEL
// Isso recebe mensagens do WhatsApp e responde automaticamente

export default async function handler(req, res) {
  // Só aceita POST (mensagens do WhatsApp)
  if (req.method !== 'POST') {
    return res.status(200).send('OK'); // Para verificação do Meta
  }

  try {
    // Pega dados da mensagem que chegou
    const body = req.body;
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    // Se não tiver mensagem, ignora (pode ser status)
    if (!message) {
      return res.status(200).json({ status: 'ignorado' });
    }

    // Dados do cliente
    const telefone = message.from;
    const nome = value?.contacts?.[0]?.profile?.name || 'Cliente';
    const texto = message.text?.body?.toLowerCase() || '';
    
    console.log(`Mensagem de ${nome} (${telefone}): ${texto}`);

    // ===== AQUI ENTRA A INTELIGÊNCIA DO ROBÔ =====
    
    let resposta = '';
    
    // Saudação
    if (texto.includes('oi') || texto.includes('olá') || texto.includes('ola')) {
      resposta = `Olá ${nome}! 👋 Sou a atendente virtual da *Sua Empresa*. Posso ajudar com:\n\n• Refrigeração\n• Máquina de lavar\n• Marcenaria\n\nQual serviço você precisa? E qual seu bairro?`;
    }
    // Perguntou sobre serviço
    else if (texto.includes('geladeira') || texto.includes('refrigeração') || texto.includes('frio')) {
      resposta = `Para refrigeração, preciso saber:\n\n1️⃣ Qual seu bairro?\n2️⃣ O que está acontecendo com o aparelho?\n3️⃣ Consegue enviar uma foto?\n\nAssim já passo o valor da visita! 🔧`;
    }
    // Perguntou preço/valor
    else if (texto.includes('preço') || texto.includes('preco') || texto.includes('valor') || texto.includes('quanto')) {
      resposta = `Os valores dependem do bairro! 📍\n\nMe diga seu bairro que consulto na hora:\n• Visita técnica: a partir de R$ 50\n• Orçamento: grátis na visita\n• Conserto: após avaliação\n\nQual seu bairro?`;
    }
    // Cliente mandou bairro (detecta se tem "bairro" ou nome comum)
    else if (texto.includes('centro') || texto.includes('jardim') || texto.includes('vila')) {
      resposta = `Perfeito! Para o bairro que você mencionou:\n\n💰 *Visita técnica: R$ 60*\n⏰ *Disponibilidade: amanhã ou sábado*\n\nPara agendar, preciso confirmar:\n• Seu endereço completo\n• Melhor horário\n• Telefone para contato\n\nPosso agendar agora? ✅`;
    }
    // Quer agendar
    else if (texto.includes('agendar') || texto.includes('marcar') || texto.includes('pode ser') || texto.includes('sim')) {
      resposta = `Ótimo! 🎉 Vou precisar de:\n\n📍 Endereço completo (rua, número)\n📅 Dia preferido\n⏰ Período: manhã ou tarde?\n\nAssim envio para o técnico *João* confirmar! 🔧`;
    }
    // Não entendeu - pede ajuda humana
    else {
      // Salva no Supabase para intervenção
      await salvarIntervencao(telefone, nome, texto);
      
      resposta = `Hmm, ${nome}, essa pergunta é mais específica... 🤔\n\nDeixa eu chamar minha supervisora para te atender melhor! Só um momento... ⏳\n\n(Alguém já foi notificado e vai te responder em breve)`;
    }

    // Envia resposta de volta pelo WhatsApp
    await enviarWhatsApp(telefone, resposta);

    // Responde pro Meta que deu tudo certo
    res.status(200).json({ status: 'mensagem_processada' });

  } catch (erro) {
    console.error('Erro:', erro);
    res.status(200).json({ status: 'erro_mas_ok' }); // Sempre responde 200 pro Meta
  }
}

// Função para enviar mensagem pelo WhatsApp oficial
async function enviarWhatsApp(telefone, mensagem) {
  const TOKEN = process.env.WHATSAPP_TOKEN; // Vamos configurar isso na Vercel
  const ID_NUMERO = process.env.WHATSAPP_ID_NUMERO;
  
  const resposta = await fetch(`https://graph.facebook.com/v18.0/${ID_NUMERO}/messages`, {
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
  
  return resposta.json();
}

// Função para salvar quando precisa de ajuda humana
async function salvarIntervencao(telefone, nome, mensagem) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  
  await fetch(`${SUPABASE_URL}/rest/v1/intervencoes`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      telefone,
      nome,
      mensagem,
      status: 'pendente',
      data: new Date().toISOString()
    })
  });
}
