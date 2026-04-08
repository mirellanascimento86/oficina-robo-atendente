export default async function handler(req, res) {
  // VERIFICAÇÃO DO META (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Se é verificação do webhook
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('Webhook verificado!');
      return res.status(200).send(challenge); // Retorna o desafio
    }
    
    return res.status(403).send('Verificação falhou');
  }
  
  // MENSAGENS DO WHATSAPP (POST)
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }
  
  // ... resto do seu código ...
}

// ROBÔ INTELIGENTE COM GROQ (IA GRATUITA)
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

    // Salva/atualiza cliente
    await salvarCliente(telefone, nome);
    
    // Busca contexto do cliente
    const cliente = await buscarCliente(telefone);
    const historico = await buscarHistorico(telefone, 5); // últimas 5 mensagens
    
    // Se é mídia, descreve o que é
    let conteudoMidia = '';
    if (tipoMidia !== 'text') {
      conteudoMidia = `[Cliente enviou ${tipoMidia}: ${tipoMidia === 'image' ? 'foto do problema' : tipoMidia === 'audio' ? 'mensagem de áudio' : 'vídeo'}]`;
    }

    // Busca dados do sistema (preços, técnicos)
    const dadosSistema = await buscarDadosSistema();
    
    // MONTA PROMPT PARA IA
    const promptSistema = `Você é Maria, atendente experiente da empresa de serviços técnicos. 
Tom: caloroso, profissional, direto, como brasileira de verdade.

SERVIÇOS: Refrigeração, Máquina de Lavar, Marcenaria.

DADOS ATUAIS:
${JSON.stringify(dadosSistema, null, 2)}

CLIENTE ATUAL:
- Nome: ${nome}
- Telefone: ${telefone}
- Etapa: ${cliente.etapa || 'primeiro contato'}
- Serviço escolhido: ${cliente.servico || 'ainda não escolheu'}
- Bairro: ${cliente.bairro || 'ainda não informou'}

HISTÓRICO RECENTE:
${historico.map(h => `${h.origem}: ${h.mensagem}`).join('\n')}

REGRAS IMPORTANTES:
1. Sempre pergunte o bairro antes de dar preço
2. Visita técnica custa entre R$ 50-100 dependendo do bairro
3. Orçamento é grátis na visita
4. Pergunte se tem foto do defeito
5. Ofereça datas: amanhã manhã/tarde ou sábado
6. Se não souber algo, diga que vai verificar com a supervisora
7. Nunca invente preços, use os dados fornecidos
8. Seja persuasiva para fechar a visita

OBJETIVO: Fechar agendamento de visita técnica.`;

    // CHAMA GROQ API
    const respostaIA = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // ou 'mixtral-8x7b-32768'
        messages: [
          { role: 'system', content: promptSistema },
          { role: 'user', content: conteudoMidia || texto }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const dadosIA = await respostaIA.json();
    let resposta = dadosIA.choices?.[0]?.message?.content;

    // Se IA pediu ajuda ou deu erro
    if (!resposta || resposta.includes('supervisora') || resposta.includes('não sei') || resposta.includes('verificar')) {
      await salvarIntervencao(telefone, nome, texto || conteudoMidia, 'ia_pediu_ajuda');
      await avisarTelegram(nome, texto || 'IA pediu ajuda', telefone);
    }

    // Detecta intenção para atualizar etapa
    const novaEtapa = detectarEtapa(texto, cliente.etapa);
    await atualizarCliente(telefone, { 
      etapa: novaEtapa,
      ...(detectarServico(texto) && { servico: detectarServico(texto) }),
      ...(texto.length > 3 && !cliente.bairro && { bairro: texto })
    });

    // Se fechou agendamento, avisa técnico
    if (novaEtapa === 'agendado' && cliente.etapa !== 'agendado') {
      await avisarTecnico({ ...cliente, telefone, nome });
    }

    // Salva no histórico
    await salvarMensagem(telefone, 'cliente', texto || conteudoMidia);
    await salvarMensagem(telefone, 'robo', resposta);

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

function detectarEtapa(texto, etapaAtual) {
  const t = texto.toLowerCase();
  
  if (!etapaAtual || etapaAtual === 'primeiro_contato') {
    if (detectarServico(texto)) return 'servico_escolhido';
  }
  
  if (etapaAtual === 'servico_escolhido') {
    if (t.length > 3 && !t.includes('oi') && !t.includes('olá')) return 'bairro_informado';
  }
  
  if (etapaAtual === 'bairro_informado') {
    if (t.includes('amanhã') || t.includes('sábado') || t.includes('segunda') || t.includes('tarde') || t.includes('manhã')) return 'data_escolhida';
  }
  
  if (etapaAtual === 'data_escolhida') {
    if (t.includes('rua') || t.includes('avenida') || t.includes('av.') || t.includes('número') || t.includes('casa') || t.includes('apartamento')) return 'agendado';
  }
  
  return etapaAtual || 'primeiro_contato';
}

async function buscarDadosSistema() {
  // Busca preços e técnicos do Supabase
  const [precosRes, tecnicosRes] = await Promise.all([
    fetch(`${process.env.SUPABASE_URL}/rest/v1/precos?select=*`, {
      headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
    }),
    fetch(`${process.env.SUPABASE_URL}/rest/v1/tecnicos?select=*`, {
      headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
    })
  ]);
  
  const precos = await precosRes.json();
  const tecnicos = await tecnicosRes.json();
  
  return { precos, tecnicos };
}

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
      body: JSON.stringify({ telefone, nome, etapa: 'primeiro_contato' })
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

async function buscarHistorico(telefone, limite = 5) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/historico?telefone=eq.${telefone}&order=data.desc&limit=${limite}`, {
    headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
  });
  return await res.json();
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

async function salvarIntervencao(telefone, nome, mensagem, motivo) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/intervencoes`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ telefone, nome, mensagem, motivo, status: 'pendente', data: new Date().toISOString() })
  });
}

async function avisarTelegram(nome, mensagem, telefone) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  
  const texto = `🆘 *INTERVENÇÃO*\n\n👤 *${nome}*\n📱 ${telefone}\n💬 "${mensagem.substring(0, 100)}..."\n\n👉 https://seu-projeto.vercel.app/intervencao?telefone=${telefone}`;
  
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'Markdown' })
  });
}

async function avisarTecnico(cliente) {
  const tecnicosRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/tecnicos?especialidade=eq.${cliente.servico}&select=*`, {
    headers: { 'apikey': process.env.SUPABASE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_KEY}` }
  });
  const tecnicos = await tecnicosRes.json();
  const tecnico = tecnicos[0];
  if (!tecnico) return;

  const msg = `🚨 *NOVO AGENDAMENTO*\n\n👤 ${cliente.nome}\n📱 ${cliente.telefone}\n🔧 ${cliente.servico}\n📍 ${cliente.bairro}\n\nConfirmar disponibilidade?`;
  
  await enviarWhatsApp(tecnico.whatsapp, msg);
}

async function enviarWhatsApp(telefone, mensagem) {
  await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_ID_NUMERO}/messages`, {
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
}
