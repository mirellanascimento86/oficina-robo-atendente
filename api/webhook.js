// WEBHOOK WHATSAPP - VERSÃO FINAL FUNCIONAL
export default async function handler(req, res) {
  // ===== VERIFICAÇÃO DO META (GET) =====
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('Verificação GET:', { mode, token, challenge });
    
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'oficina123token';
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verificado!');
      return res.status(200).send(challenge);
    }
    
    return res.status(403).send('Falha na verificação');
  }
  
  // ===== RECEBER MENSAGENS (POST) =====
  if (req.method === 'POST') {
    console.log('POST recebido do WhatsApp');
    
    // Responde imediatamente pro Meta
    res.status(200).json({ status: 'recebido' });
    
    // Processa em background
    try {
      await processarMensagem(req.body);
    } catch (erro) {
      console.error('Erro processando mensagem:', erro);
    }
    
    return;
  }
  
  return res.status(405).send('Method not allowed');
}

// PROCESSA MENSAGEM COM IA
async function processarMensagem(body) {
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const message = value?.messages?.[0];
  
  if (!message) {
    console.log('Nenhuma mensagem no payload');
    return;
  }
  
  const telefone = message.from;
  const nome = value?.contacts?.[0]?.profile?.name || 'Cliente';
  const texto = message.text?.body || '';
  const tipo = message.type || 'text';
  
  console.log(`📩 ${nome} (${telefone}): ${texto || '[' + tipo + ']'}`);
  
  // Verifica configuração WhatsApp
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_ID_NUMERO) {
    console.error('❌ ERRO: WHATSAPP_TOKEN ou WHATSAPP_ID_NUMERO não configurados!');
    return;
  }
  
  // Se é mídia
  if (tipo !== 'text') {
    console.log(`Mídia recebida: ${tipo}`);
    await enviarWhatsApp(telefone, `Recebi seu ${tipo}. Vou analisar e já respondo! 📎`);
    await avisarIntervencao(nome, `Enviou ${tipo}`, telefone);
    return;
  }
  
  // BUSCA CONTEXTO DO CLIENTE
  const cliente = await buscarCliente(telefone);
  const ehNovo = !cliente.id;
  
  if (ehNovo) {
    await criarCliente(telefone, nome);
  }
  
  // GERA RESPOSTA COM IA GROQ
  let resposta = '';
  
  try {
    if (process.env.GROQ_API_KEY) {
      resposta = await gerarRespostaIA(texto, nome, cliente);
    } else {
      console.log('GROQ_API_KEY não configurado, usando resposta padrão');
      resposta = gerarRespostaPadrao(texto, nome);
    }
  } catch (erro) {
    console.error('Erro na IA:', erro);
    resposta = gerarRespostaPadrao(texto, nome);
  }
  
  // ENVIA RESPOSTA
  await enviarWhatsApp(telefone, resposta);
  console.log('✅ Resposta enviada');
  
  // SALVA NO HISTÓRICO
  await salvarMensagem(telefone, 'cliente', texto);
  await salvarMensagem(telefone, 'robo', resposta);
  
  // ATUALIZA ETAPA
  const novaEtapa = detectarEtapa(texto, cliente.etapa);
  await atualizarCliente(telefone, { etapa: novaEtapa });
  
  // SE FECHOU AGENDAMENTO, AVISA TÉCNICO
  if (novaEtapa === 'agendado' && cliente.etapa !== 'agendado') {
    await avisarTecnico(cliente, telefone, nome);
  }
  
  // SE PEDIU AJUDA, AVISA HUMANO
  if (resposta.includes('supervisora') || resposta.includes('não sei') || resposta.includes('verificar')) {
    await avisarIntervencao(nome, texto, telefone);
  }
}

// IA GROQ
async function gerarRespostaIA(mensagem, nome, cliente) {
  const contexto = `
Você é Maria, atendente experiente e super simpática de uma oficina de consertos em São Paulo.

DADOS DO CLIENTE:
- Nome: ${nome}
- Etapa atual: ${cliente.etapa || 'primeiro contato'}
- Serviço escolhido: ${cliente.servico || 'ainda não escolheu'}
- Bairro: ${cliente.bairro || 'ainda não informou'}

SERVIÇOS: Refrigeração (geladeiras, freezers), Máquina de Lavar, Marcenaria (móveis, portas).

REGRAS DE OURO:
1. SEMPRE pergunte o bairro antes de dar preço
2. Visita técnica: R$ 50-100 (depende do bairro)
3. Orçamento é GRÁTIS na visita
4. Peça foto do defeito para análise
5. Ofereça datas: amanhã manhã/tarde ou sábado
6. Seja persuasiva para fechar a visita
7. Se não souber algo, diga que vai chamar a supervisora
8. Use emojis e seja calorosa, como brasileira de verdade

OBJETIVO: Fechar agendamento de visita técnica.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        { role: 'system', content: contexto },
        { role: 'user', content: `Cliente disse: "${mensagem}"` }
      ],
      temperature: 0.8,
      max_tokens: 400
    })
  });
  
  if (!res.ok) {
    throw new Error(`Groq erro: ${res.status}`);
  }
  
  const dados = await res.json();
  return dados.choices?.[0]?.message?.content || gerarRespostaPadrao(mensagem, nome);
}

// RESPOSTA PADRÃO (sem IA)
function gerarRespostaPadrao(texto, nome) {
  const t = texto.toLowerCase();
  
  if (t.match(/\b(oi|olá|ola|hey|bom dia|boa tarde|boa noite)\b/)) {
    return `Olá ${nome}! 👋 Que bom te ver por aqui!\n\nSou a Maria, especialista em consertos. Posso ajudar você com:\n\n🔧 *Refrigeração* (geladeiras, freezers)\n🧺 *Máquina de lavar* (todas as marcas)\n🪚 *Marcenaria* (móveis, portas, armários)\n\nQual serviço você precisa hoje? 😊`;
  }
  
  if (t.match(/\b(preço|preco|valor|custo|quanto|quantos)\b/)) {
    return `Oi ${nome}! 💰\n\nO valor depende do seu bairro, mas fica tranquila que é justo:\n\n📍 *Visita técnica*: R$ 50 a R$ 80\n📋 *Orçamento*: GRÁTIS na visita\n🔧 *Conserto*: orçamos na hora, sem compromisso\n\nQual seu bairro? Assim te passo o valor exato!`;
  }
  
  if (t.match(/\b(geladeira|freezer|refrigeração|frio|esfriar|congelar)\b/)) {
    return `Entendido, ${nome}! ❄️ Problema de refrigeração.\n\nPara te passar o valor certinho da visita, preciso saber:\n\n1️⃣ Qual seu bairro?\n2️⃣ O aparelho liga mas não gela? Ou não liga?\n3️⃣ Tem como enviar uma foto?\n\nAssim já marcamos com o técnico especializado!`;
  }
  
  if (t.match(/\b(máquina|maquina|lavar|lavadora|roupa|centrifuga)\b/)) {
    return `Máquina de lavar, ${nome}? 🧺 A gente conserta todas as marcas!\n\nMe conta:\n\n1️⃣ Qual seu bairro?\n2️⃣ Qual a marca e modelo (se souber)?\n3️⃣ O que ela está fazendo de errado?\n\nCom essas info já te passo o valor da visita!`;
  }
  
  if (t.match(/\b(marcenaria|móvel|movel|porta|armário|armario|madeira|mesa|cadeira)\b/)) {
    return `Marcenaria, ${nome}! 🪚 Adoro um trabalho bem feito em madeira!\n\nPara orçar a visita, preciso saber:\n\n1️⃣ Qual seu bairro?\n2️⃣ O que precisa? (conserto, ajuste, instalação?)\n3️⃣ Tem foto do móvel/porta?\n\nVamos resolver isso!`;
  }
  
  if (t.match(/\b(centro|jardim|vila|bairro|zona|região|regiao)\b/) && t.length < 30) {
    return `✅ *${texto}* anotado!\n\n💰 Valor da visita: *R$ 60,00*\n⏱️ Duração: 30-40 minutos\n📋 Orçamento grátis na hora\n\n*Disponibilidade:*\n• Amanhã de manhã (8h-12h)\n• Amanhã à tarde (14h-18h)  \n• Sábado o dia todo\n\nQual dia e horário fica melhor pra você? 🗓️`;
  }
  
  if (t.match(/\b(amanhã|amanha|sabado|sábado|segunda|terça|terca|quarta|quinta|sexta|hoje|agora)\b/)) {
    return `Perfeito, ${nome}! 📅 *${texto}* reservado!\n\nAgora preciso do endereço completo para enviar ao técnico:\n\n🏠 Rua, número, complemento (ap/bloco)\n\nAssim que confirmar o endereço, já envio pro técnico e te passo o contato dele! ✅`;
  }
  
  if (t.match(/\b(rua|avenida|av|travessa|tv|alameda|numero|número|casa|apartamento|ap|bloco)\b/)) {
    return `✅ *AGENDAMENTO CONFIRMADO, ${nome}!* 🎉\n\n📍 Endereço: ${texto}\n💰 Visita: R$ 60,00\n📅 Data: amanhã\n\nJá avisei o técnico. Ele vai:\n1️⃣ Confirmar o horário\n2️⃣ Te ligar 30min antes de chegar\n3️⃣ Fazer diagnóstico + orçamento grátis\n\nFormas de pagamento: Pix, cartão ou dinheiro 💳\n\nAlguma dúvida? Estou por aqui! 😊`;
  }
  
  return `Entendi, ${nome}! 🤔\n\nPara te ajudar da melhor forma, me conta rapidinho:\n\n1️⃣ Qual serviço você precisa? (refrigeração, máquina de lavar ou marcenaria)\n2️⃣ Qual seu bairro?\n\nCom essas 2 info já te passo o valor exato e disponibilidade! ⚡`;
}

// SUPABASE COM SUA CHAVE
const SUPABASE_URL = 'https://ehpikmqrieldplwkmyyo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVocGlrbXFyaWVsZHBsd2tteXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzkzMjIsImV4cCI6MjA4OTcxNTMyMn0.7q5-vcJfzqjcaiiuvDg1kMGFmWEH07bBscqKH85DN0c';

async function buscarCliente(telefone) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clientes?telefone=eq.${telefone}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const dados = await res.json();
    return dados[0] || {};
  } catch (e) {
    console.error('Erro buscar cliente:', e);
    return {};
  }
}

async function criarCliente(telefone, nome) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/clientes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telefone,
        nome,
        etapa: 'inicio',
        created_at: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Erro criar cliente:', e);
  }
}

async function atualizarCliente(telefone, dados) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/clientes?telefone=eq.${telefone}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dados)
    });
  } catch (e) {
    console.error('Erro atualizar cliente:', e);
  }
}

async function salvarMensagem(telefone, origem, texto) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/historico`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telefone,
        origem,
        mensagem: texto,
        data: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Erro salvar mensagem:', e);
  }
}

function detectarEtapa(texto, etapaAtual) {
  const t = texto.toLowerCase();
  
  if (!etapaAtual || etapaAtual === 'inicio') {
    if (t.match(/\b(geladeira|freezer|máquina|maquina|lavar|marcenaria|móvel|movel)\b/)) return 'servico_escolhido';
  }
  
  if (etapaAtual === 'servico_escolhido') {
    if (t.match(/\b(centro|jardim|vila|bairro|zona)\b/)) return 'bairro_informado';
  }
  
  if (etapaAtual === 'bairro_informado') {
    if (t.match(/\b(amanhã|amanha|sabado|sábado|hoje|agora)\b/)) return 'data_escolhida';
  }
  
  if (etapaAtual === 'data_escolhida') {
    if (t.match(/\b(rua|avenida|av|casa|apartamento|numero|número)\b/)) return 'agendado';
  }
  
  return etapaAtual || 'inicio';
}

async function avisarTecnico(cliente, telefone, nome) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tecnicos?especialidade=eq.${cliente.servico}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const tecnicos = await res.json();
    const tecnico = tecnicos[0];
    
    if (!tecnico) return;
    
    const msg = `🚨 *NOVO AGENDAMENTO - ${tecnico.nome}*\n\n👤 Cliente: ${nome}\n📱 ${telefone}\n🔧 Serviço: ${cliente.servico}\n📍 ${cliente.bairro || 'Bairro não informado'}\n📅 ${cliente.data_preferencia || 'Amanhã'}\n\nResponda *SIM* para confirmar ou entre em contato com o cliente.`;
    
    await enviarWhatsApp(tecnico.whatsapp, msg);
    console.log('✅ Técnico avisado:', tecnico.nome);
    
  } catch (e) {
    console.error('Erro avisar técnico:', e);
  }
}

async function avisarIntervencao(nome, mensagem, telefone) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/intervencoes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telefone,
        nome,
        mensagem,
        status: 'pendente',
        data: new Date().toISOString()
      })
    });
    
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const texto = `🆘 *PRECISA DE AJUDA*\n\n👤 ${nome}\n📱 ${telefone}\n💬 "${mensagem.substring(0, 100)}"\n\n👉 https://oficina-robo-atendente.vercel.app/intervencao?telefone=${telefone}`;
      
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: texto,
          parse_mode: 'Markdown'
        })
      });
    }
    
  } catch (e) {
    console.error('Erro avisar intervenção:', e);
  }
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
        recipient_type: 'individual',
        to: telefone,
        type: 'text',
        text: { body: mensagem }
      })
    });
    
    const dados = await res.json();
    
    if (dados.error) {
      console.error('❌ Erro WhatsApp API:', dados.error);
      return false;
    }
    
    return true;
    
  } catch (e) {
    console.error('❌ Erro enviar WhatsApp:', e);
    return false;
  }
}
