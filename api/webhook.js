// ROBÔ COMPLETO - Faz tudo: atende, agenda, avisa técnico
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    
    if (!message) return res.status(200).json({ status: 'ignorado' });

    const telefone = message.from;
    const nome = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || 'Cliente';
    const texto = message.text?.body || '';
    const tipoMidia = message.type;

    // Salva/atualiza cliente no banco
    await salvarCliente(telefone, nome);

    // Busca histórico da conversa
    const historico = await buscarHistorico(telefone);
    const etapa = historico.etapa || 'inicio';

    let resposta = '';
    let novaEtapa = etapa;

    // LÓGICA DO ATENDIMENTO (etapas)
    if (etapa === 'inicio') {
      if (texto.toLowerCase().includes('oi') || texto.toLowerCase().includes('olá') || texto.toLowerCase().includes('ola')) {
        resposta = `Olá ${nome}! 👋 Sou a atendente virtual da *Sua Empresa*.\n\nPosso ajudar com:\n• 🔧 Refrigeração\n• 🧺 Máquina de lavar  \n• 🪚 Marcenaria\n\nQual serviço você precisa?`;
        novaEtapa = 'escolher_servico';
      } else {
        resposta = `Oi! 😊 Não entendi bem. Posso ajudar com reforma, conserto de geladeira, máquina de lavar ou marcenaria. Qual você precisa?`;
      }
    }
    else if (etapa === 'escolher_servico') {
      const servico = detectarServico(texto);
      if (servico) {
        await atualizarCliente(telefone, { servico });
        resposta = `Perfeito! *${servico}* anotado. 📍 Qual seu bairro? Assim consulto o valor da visita.`;
        novaEtapa = 'perguntar_bairro';
      } else {
        resposta = `Desculpe, não entendi. Pode repetir? Diga se é:\n• Refrigeração (geladeira, freezer)\n• Lavanderia (máquina de lavar)\n• Marcenaria (móveis, portas)`;
      }
    }
    else if (etapa === 'perguntar_bairro') {
      const bairro = texto;
      const cliente = await buscarCliente(telefone);
      const preco = await buscarPreco(cliente.servico, bairro);
      
      await atualizarCliente(telefone, { bairro, valor_visita: preco?.valor || 60 });
      
      resposta = `✅ *${bairro}* - Valor da visita: *R$ ${preco?.valor || 60},00*\n\n⏰ Temos disponibilidade:\n• Amanhã pela manhã\n• Amanhã à tarde  \n• Sábado o dia todo\n\nQual dia e período prefere?`;
      novaEtapa = 'agendar_data';
    }
    else if (etapa === 'agendar_data') {
      await atualizarCliente(telefone, { data_preferencia: texto });
      resposta = `Ótimo! 📅 *${texto}* anotado.\n\nPreciso do endereço completo (rua, número) para enviar ao técnico:`;
      novaEtapa = 'pegar_endereco';
    }
    else if (etapa === 'pegar_endereco') {
      await atualizarCliente(telefone, { endereco: texto });
      const cliente = await buscarCliente(telefone);
      
      resposta = `✅ *Resumo do agendamento:*\n\n📍 ${cliente.bairro} - ${texto}\n🔧 ${cliente.servico}\n📅 ${cliente.data_preferencia}\n💰 Visita: R$ ${cliente.valor_visita},00\n\nO técnico *João* vai confirmar em breve! Vou te avisar assim que ele responder.`;
      
      // AVISA TÉCNICO AUTOMATICAMENTE!
      await avisarTecnico(cliente);
      
      novaEtapa = 'aguardando_tecnico';
    }
    else if (etapa === 'aguardando_tecnico') {
      resposta = `Estou aguardando a confirmação do técnico, ${nome}. Assim que ele responder, te aviso! ⏳\n\nSe precisar remarcar ou cancelar, é só falar.`;
    }

    // Se é mídia ou não entendeu em qualquer etapa
    if (tipoMidia !== 'text' || (!resposta && etapa !== 'inicio')) {
      await salvarIntervencao(telefone, nome, texto || `[${tipoMidia}]`, etapa);
      await avisarTelegramIntervencao(nome, texto || `Enviou ${tipoMidia}`, telefone, etapa);
      resposta = `Hmm, ${nome}, isso é um pouco mais complexo... 🤔\n\nDeixa eu chamar minha supervisora para te ajudar melhor! Ela já foi avisada no Telegram e vai te responder em breve. ⏳`;
    }

    // Salva no histórico
    await salvarMensagem(telefone, 'cliente', texto || `[${tipoMidia}]`);
    await salvarMensagem(telefone, 'robo', resposta);
    await atualizarCliente(telefone, { etapa: novaEtapa });

    // Envia resposta
    await enviarWhatsApp(telefone, resposta);
    
    res.status(200).json({ sucesso: true });

  } catch (erro) {
    console.error('Erro:', erro);
    res.status(200).json({ status: 'erro' });
  }
}

// FUNÇÕES AUXILIARES

function detectarServico(texto) {
  const t = texto.toLowerCase();
  if (t.includes('geladeira') || t.includes('freezer') || t.includes('refrigeração') || t.includes('frio')) return 'Refrigeração';
  if (t.includes('máquina') || t.includes('lavar') || t.includes('lavadora')) return 'Máquina de Lavar';
  if (t.includes('marcenaria') || t.includes('móvel') || t.includes('porta') || t.includes('madeira')) return 'Marcenaria';
  return null;
}

async function avisarTecnico(cliente) {
  // Busca técnico do serviço
  const tecnico = await buscarTecnico(cliente.servico);
  if (!tecnico) return;

  const mensagem = `🚨 *NOVO AGENDAMENTO - CONFIRME*\n\n📅 Data: ${cliente.data_preferencia}\n📍 ${cliente.bairro}\n🏠 ${cliente.endereco}\n🔧 ${cliente.servico}\n💰 Visita: R$ ${cliente.valor_visita}\n👤 ${cliente.nome}\n📱 ${cliente.telefone}\n\nResponda *SIM* para confirmar ou ligue para o cliente.`;

  await enviarWhatsApp(tecnico.whatsapp, mensagem);
  
  // Também avisa no Telegram para você saber
  await avisarTelegramTecnico(tecnico.nome, cliente);
}

async function avisarTelegramIntervencao(nome, mensagem, telefone, etapa) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  
  const texto = `🆘 *INTERVENÇÃO NECESSÁRIA*\n\n👤 *${nome}*\n📱 ${telefone}\n📍 Etapa: ${etapa}\n💬 "${mensagem.substring(0, 100)}..."\n\n👉 Acesse: https://seu-projeto.vercel.app/intervencao?telefone=${telefone}`;
  
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'Markdown' })
  });
}

async function avisarTelegramTecnico(nomeTecnico, cliente) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  
  const texto = `✅ *TÉCNICO AVISADO*\n\n👨‍🔧 ${nomeTecnico} recebeu:\n📅 ${cliente.data_preferencia}\n📍 ${cliente.bairro}\n👤 ${cliente.nome}\n\nAguardando confirmação...`;
  
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'Markdown' })
  });
}

// FUNÇÕES DO SUPABASE (simplificadas)
async function buscarCliente(telefone) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/clientes?telefone=eq.${telefone}&select=*`, {
    headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
  });
  const dados = await res.json();
  return dados[0] || {};
}

async function salvarCliente(telefone, nome) {
  const existe = await buscarCliente(telefone);
  if (!existe.id) {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/clientes`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ telefone, nome, etapa: 'inicio' })
    });
  }
}

async function atualizarCliente(telefone, dados) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/clientes?telefone=eq.${telefone}`, {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dados)
  });
}

async function buscarPreco(servico, bairro) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/precos?servico=eq.${servico}&bairro=ilike.*${bairro}*&select=*`, {
    headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
  });
  const dados = await res.json();
  return dados[0];
}

async function buscarTecnico(servico) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/tecnicos?especialidade=eq.${servico}&select=*`, {
    headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
  });
  const dados = await res.json();
  return dados[0]; // Pega o primeiro técnico da especialidade
}

async function salvarMensagem(telefone, origem, texto) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/historico`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ telefone, origem, mensagem: texto, data: new Date().toISOString() })
  });
}

async function salvarIntervencao(telefone, nome, mensagem, etapa) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/intervencoes`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ telefone, nome, mensagem, etapa, status: 'pendente', data: new Date().toISOString() })
  });
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
      recipient_type: 'individual',
      to: telefone,
      type: 'text',
      text: { body: mensagem }
    })
  });
  return res.json();
}
