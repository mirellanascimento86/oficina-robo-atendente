// ============================================================
// 🤖 OFICINA BOT - WEBHOOK WHATSAPP BUSINESS API
// Versão Profissional com IA Groq + Sistema de Comandos
// ============================================================

// CONFIGURAÇÕES
const CONFIG = {
  SUPABASE_URL: 'https://ehpikmqrieldplwkmyyo.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVocGlrbXFyaWVsZHBsd2tteXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzkzMjIsImV4cCI6MjA4OTcxNTMyMn0.7q5-vcJfzqjcaiiuvDg1kMGFmWEH07bBscqKH85DN0c'
};

// Handler principal
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // VERIFICAÇÃO META (GET)
  if (req.method === 'GET') {
    return handleVerification(req, res);
  }
  
  // RECEBER MENSAGENS (POST)
  if (req.method === 'POST') {
    // Responde imediatamente para não dar timeout no Meta
    res.status(200).json({ status: 'received' });
    
    // Processa em background
    processMessageAsync(req.body).catch(console.error);
    return;
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

// Verificação do webhook
function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'oficina123token';
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    return res.status(200).send(challenge);
  }
  
  return res.status(403).json({ error: 'Verification failed' });
}

// Processamento assíncrono da mensagem
async function processMessageAsync(body) {
  try {
    const { entry } = body;
    if (!entry || !entry[0]) return;
    
    const changes = entry[0].changes;
    if (!changes || !changes[0]) return;
    
    const value = changes[0].value;
    const message = value.messages?.[0];
    
    if (!message) {
      // Pode ser status de mensagem entregue/lida
      console.log('ℹ️ Evento sem mensagem (possívelmente status update)');
      return;
    }
    
    const phone = message.from;
    const name = value.contacts?.[0]?.profile?.name || 'Cliente';
    const type = message.type;
    
    // Ignora mensagens do próprio bot (eco)
    if (phone === process.env.WHATSAPP_ID_NUMERO) return;
    
    console.log(`\n📨 ${name} (${phone})`);
    console.log(`   Tipo: ${type}`);
    
    // Busca ou cria cliente
    let customer = await getCustomer(phone);
    if (!customer) {
      customer = await createCustomer(phone, name);
    }
    
    // Processa baseado no tipo
    let response = '';
    let needsHuman = false;
    
    if (type === 'text') {
      const text = message.text.body;
      console.log(`   Mensagem: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      
      // Verifica se é comando especial (!comando)
      if (text.startsWith('!')) {
        response = await handleCommand(text, customer);
      } else {
        // Processa com IA
        response = await processWithAI(text, customer, name);
      }
      
      // Verifica se precisa de humano
      needsHuman = checkNeedsHuman(response, text);
      
    } else if (type === 'image') {
      response = `📸 Imagem recebida! Vou analisar e já te respondo sobre o que estou vendo...`;
      needsHuman = true;
      
    } else if (type === 'audio' || type === 'voice') {
      response = `🎤 Áudio recebido! Deixa eu ouvir e já te respondo...`;
      needsHuman = true;
      
    } else if (type === 'video') {
      response = `🎥 Vídeo recebido! Vou analisar e já te dou um retorno...`;
      needsHuman = true;
      
    } else {
      response = `📎 Arquivo recebido! Vou verificar e já te respondo...`;
      needsHuman = true;
    }
    
    // Envia resposta
    await sendWhatsAppMessage(phone, response);
    console.log(`   ✅ Resposta enviada`);
    
    // Salva no histórico
    if (type === 'text') {
      await saveMessage(phone, 'customer', message.text.body);
    } else {
      await saveMessage(phone, 'customer', `[${type.toUpperCase()}]`);
    }
    await saveMessage(phone, 'bot', response);
    
    // Atualiza contexto do cliente
    await updateCustomerContext(phone, type === 'text' ? message.text.body : `[${type}]`, customer);
    
    // Se precisa de humano, cria intervenção e notifica
    if (needsHuman) {
      await createIntervention(phone, name, type === 'text' ? message.text.body : `[${type}]`, customer.stage);
      await notifyTelegram(name, phone, type === 'text' ? message.text.body : `[${type}]`);
      console.log(`   🚨 Humano notificado`);
    }
    
    // Se fechou agendamento, avisa técnico
    if (customer.stage === 'awaiting_address' && type === 'text' && 
        (message.text.body.toLowerCase().includes('rua') || 
         message.text.body.toLowerCase().includes('av') ||
         message.text.body.toLowerCase().includes('numero'))) {
      await notifyTechnician(customer, phone, name);
    }
    
  } catch (error) {
    console.error('❌ Erro no processamento:', error);
  }
}

// Processa com IA Groq
async function processWithAI(text, customer, name) {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  
  if (!GROQ_KEY) {
    console.log('⚠️ GROQ_KEY não configurado, usando respostas padrão');
    return getDefaultResponse(text, name, customer);
  }
  
  try {
    // Busca contexto adicional
    const prices = await getPricesForService(customer.service);
    const scripts = await getRelevantScripts(text);
    
    const systemPrompt = buildSystemPrompt(customer, name, prices, scripts);
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      throw new Error(`Groq error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
    
  } catch (error) {
    console.error('IA error:', error);
    return getDefaultResponse(text, name, customer);
  }
}

// Constrói prompt do sistema
function buildSystemPrompt(customer, name, prices, scripts) {
  return `Você é Maria, atendente premium da Oficina Técnica.

IDENTIDADE:
- Nome: Maria
- Tom: Profissional, caloroso, persuasivo, brasileiro autêntico
- Estilo: Consultivo, não agressivo. Faz perguntas para entender antes de propor.
- Objetivo: Fechar agendamentos de visita técnica com alta taxa de conversão

SERVIÇOS:
1. Refrigeração (geladeiras, freezers, ar-condicionado)
2. Máquinas de lavar (todas as marcas)
3. Marcenaria (móveis, portas, armários, ajustes)

REGRAS ABSOLUTAS:
1. NUNCA dê preço sem saber o bairro
2. SEMPRE ofereça datas: "amanhã pela manhã/tarde" ou "sábado"
3. PEÇA foto do defeito quando possível
4. DESTAQUE: orçamento é GRÁTIS na visita
5. Se não souber = "deixa eu confirmar com minha supervisora"
6. NUNCA prometa conserto sem ver o aparelho
7. Use emojis com moderação (máximo 2-3 por mensagem)

CLIENTE ATUAL:
- Nome: ${name}
- Telefone: ${customer.phone}
- Etapa: ${customer.stage || 'first_contact'}
- Serviço escolhido: ${customer.service || 'não definido'}
- Bairro: ${customer.neighborhood || 'não informado'}

${prices ? `PREÇOS DISPONÍVEIS:\n${prices}\n` : ''}

${scripts ? `SCRIPTS RELEVANTES:\n${scripts}\n` : ''}

INSTRUÇÃO: Responda como Maria, buscando naturalmente avançar para o agendamento.`;
}

// Respostas padrão (fallback)
function getDefaultResponse(text, name, customer) {
  const t = text.toLowerCase();
  
  // Saudação
  if (t.match(/\b(oi|olá|ola|hey|bom dia|boa tarde|boa noite|e aí|e ai)\b/)) {
    return `Olá ${name}! 👋

Sou Maria, especialista em consertos da nossa oficina técnica.

Posso ajudar você com:
🔧 *Refrigeração* (geladeiras, freezers)
🧺 *Máquina de lavar* (todas as marcas)  
🪚 *Marcenaria* (móveis, portas, armários)

Qual serviço você precisa hoje?`;
  }
  
  // Preço
  if (t.match(/\b(preço|preco|valor|custo|quanto|quantos|tá caro|ta caro)\b/)) {
    return `Oi ${name}! 💰

O investimento depende do seu bairro, mas garanto que é justo:

📍 *Visita técnica*: R$ 50 a R$ 100
📋 *Orçamento*: **GRÁTIS** na visita  
🔧 *Conserto*: orçamos na hora, você aprova antes

Qual seu bairro? Assim te passo o valor exto da visita!`;
  }
  
  // Serviços específicos
  if (t.match(/\b(geladeira|freezer|refrigeração|frio|esfriar|congelar|gelou)\b/)) {
    return `Entendido, ${name}! ❄️ Problema de refrigeração é com a gente mesmo.

Para te passar o valor certinho e verificar disponibilidade, preciso saber:

1️⃣ *Qual seu bairro?*
2️⃣ *O que está acontecendo?* (liga mas não gela? não liga? faz barulho?)

Com essas infos já consigo te ajudar!`;
  }
  
  if (t.match(/\b(máquina|maquina|lavar|lavadora|roupa|centrifuga|bate|vaza)\b/)) {
    return `Máquina de lavar, ${name}? 🧺 Perfeito, atendemos todas as marcas!

Me conta rapidinho:

1️⃣ *Qual seu bairro?*
2️⃣ *Qual marca e modelo* (se souber)?
3️⃣ *O que ela está fazendo?* (não bate? vaza? não liga? barulho estranho?)

Assim já te passo o valor da visita!`;
  }
  
  if (t.match(/\b(marcenaria|móvel|movel|porta|armário|armario|madeira|mesa|cadeira|rodinha)\b/)) {
    return `Marcenaria, ${name}! 🪚 Adoro um trabalho bem feito em madeira.

Para organizar a visita do técnico especializado:

1️⃣ *Qual seu bairro?*
2️⃣ *O que precisa?* (conserto, ajuste, instalação, montagem?)
3️⃣ *Tem foto?* Me envia que já adianto muito!

Vamos resolver isso!`;
  }
  
  // Bairro mencionado
  if (t.match(/\b(centro|jardim|vila|bairro|zona|região|regiao|mooca|tatuapé|tatuape|pinheiros|itaim|moema|brooklin|santana|lapa)\b/) && t.length < 40) {
    return `✅ *${text}* - ótimo atendemos aí!

💰 *Visita técnica*: R$ 60,00
⏱️ *Duração*: 30-40 minutos  
📋 *Orçamento*: grátis na hora

*Disponibilidade:*
• Amanhã de manhã (8h-12h)
• Amanhã à tarde (14h-18h)
• Sábado o dia todo

Qual dia e horário fica melhor pra você? 🗓️`;
  }
  
  // Data/hora
  if (t.match(/\b(amanhã|amanha|sabado|sábado|hoje|agora|segunda|terça|terca|quarta|quinta|sexta|manhã|manha|tarde|noite)\b/)) {
    return `Perfeito, ${name}! 📅 *${text}* anotado com prioridade!

Agora preciso do endereço completo para enviar ao técnico:

🏠 *Rua/Av*, *número*, *complemento* (ap/bloco)

Assim que confirmar, já envio pro técnico e ele te liga 30min antes de chegar! ✅`;
  }
  
  // Endereço
  if (t.match(/\b(rua|avenida|av|travessa|tv|alameda|estrada|rodovia|numero|número|casa|apartamento|ap|bloco|andar)\b/) && t.length > 10) {
    return `🎉 *AGENDAMENTO CONFIRMADO, ${name}!*

📍 *Endereço*: ${text}
💰 *Visita*: R$ 60,00  
📅 *Data*: amanhã (conforme combinado)
⏱️ *Duração*: 30-40 minutos

*O que acontece agora:*
1️⃣ Técnico *João* (especialista) vai te ligar 30min antes
2️⃣ Diagnóstico completo + orçamento grátis
3️⃣ Você aprova o valor antes de qualquer conserto
4️⃣ Se aprovar, resolvemos na hora!

*Pagamento*: Pix, cartão ou dinheiro 💳

Alguma dúvida? Estou por aqui! 😊`;
  }
  
  // Urgência
  if (t.match(/\b(urgente|emergência|emergencia|preciso hoje|quebrou tudo|estragou|não aguento|nao aguento|desesperado)\b/)) {
    return `Entendo a urgência, ${name}! 🚨

Deixa eu verificar a disponibilidade do técnico para *hoje ainda*.

Qual seu bairro? Se for próximo à região que ele está atendendo agora, talvez consiga um encaixe ainda na parte da tarde!

Me confirma o bairro e o que está acontecendo com o aparelho?`;
  }
  
  // Desconto/negociação
  if (t.match(/\b(desconto|mais barato|cupom|promoção|promocao|parcela|dividido)\b/)) {
    return `${name}, entendo que orçamento é importante! 💚

Aqui vai o que posso fazer por você:

✅ *Orçamento é GRÁTIS* (você só paga se aprovar o conserto)
✅ *Visita técnica*: R$ 60 (já inclui diagnóstico completo)
✅ *Se fizer o serviço*: visita fica por R$ 40 (desconto de R$ 20)

E no conserto aceitamos:
💳 Cartão em até 12x
💵 Pix (5% de desconto)
💶 Dinheiro

Quer agendar para amanhã?`;
  }
  
  // Dúvida genérica
  return `Entendi, ${name}! 🤔

Para te ajudar da melhor forma possível, me conta rapidinho:

1️⃣ *Qual serviço você precisa?*
   (refrigeração, máquina de lavar ou marcenaria)

2️⃣ *Qual seu bairro?*

Com essas 2 informações já te passo o valor exato da visita e a disponibilidade mais próxima! ⚡`;
}

// Comandos especiais (!comando)
async function handleCommand(text, customer) {
  const cmd = text.toLowerCase().trim();
  
  if (cmd === '!ajuda' || cmd === '!help') {
    return `📋 *Comandos disponíveis:*

!ajuda - Mostra esta mensagem
!preços - Ver tabela de preços
!técnicos - Ver técnicos disponíveis
!cancelar - Cancelar agendamento
!reclamar - Falar com supervisora

Ou simplesmente me diga o que precisa! 😊`;
  }
  
  if (cmd === '!preços' || cmd === '!precos') {
    const prices = await getAllPrices();
    return `💰 *Tabela de Preços - Visita Técnica:*\n\n${prices || 'Consulte seu bairro específico'}\n\nOrçamento na visita: *GRÁTIS*`;
  }
  
  if (cmd === '!técnicos' || cmd === '!tecnicos') {
    const techs = await getAllTechnicians();
    return `👨‍🔧 *Nossos Técnicos:*\n\n${techs || 'Técnicos especializados por área'}`;
  }
  
  if (cmd === '!cancelar') {
    return `Entendido! ❌ Cancelamento anotado.

Posso ajudar com algo mais ou prefere remarcar para outro dia?`;
  }
  
  if (cmd === '!reclamar' || cmd === '!humano' || cmd === '!supervisora') {
    return `Claro, ${customer.name || 'cliente'}! 👩‍💼

Estou chamando minha supervisora agora. Ela vai te atender em poucos minutos.

Aguarde um momento, por favor... ⏳`;
  }
  
  return `Comando não reconhecido. Digite !ajuda para ver os comandos disponíveis.`;
}

// Verifica se precisa de humano
function checkNeedsHuman(response, originalText) {
  const lowerResponse = response.toLowerCase();
  const lowerText = originalText.toLowerCase();
  
  // Palavras que indicam necessidade de humano
  const humanTriggers = [
    'supervisora', 'humano', 'não sei', 'não tenho certeza',
    'vou verificar', 'pergunta complexa', 'não entendi direito'
  ];
  
  // Se resposta contém trigger de humano
  if (humanTriggers.some(trigger => lowerResponse.includes(trigger))) {
    return true;
  }
  
  // Se cliente pediu explicitamente
  if (lowerText.includes('falar com pessoa') || 
      lowerText.includes('atendente humano') ||
      lowerText.includes('não quero falar com robô') ||
      lowerText.includes('quero falar com gente')) {
    return true;
  }
  
  return false;
}

// Atualiza contexto do cliente
async function updateCustomerContext(phone, text, customer) {
  const t = text.toLowerCase();
  let updates = {};
  
  // Detecta serviço
  if (!customer.service) {
    if (t.includes('geladeira') || t.includes('freezer') || t.includes('refrigeração')) {
      updates.service = 'refrigeracao';
    } else if (t.includes('máquina') || t.includes('lavar') || t.includes('lavadora')) {
      updates.service = 'lavanderia';
    } else if (t.includes('marcenaria') || t.includes('móvel') || t.includes('porta')) {
      updates.service = 'marcenaria';
    }
  }
  
  // Detecta bairro (simplificado)
  if (!customer.neighborhood && t.length < 30 && 
      (t.includes('centro') || t.includes('jardim') || t.includes('vila') || 
       t.includes('zona') || t.includes('bairro'))) {
    updates.neighborhood = text;
  }
  
  // Atualiza estágio da conversa
  const stage = determineStage(t, customer.stage);
  if (stage !== customer.stage) {
    updates.stage = stage;
  }
  
  if (Object.keys(updates).length > 0) {
    await updateCustomer(phone, updates);
  }
}

// Determina estágio da conversa
function determineStage(text, currentStage) {
  const t = text.toLowerCase();
  
  if (!currentStage || currentStage === 'first_contact') {
    if (t.includes('geladeira') || t.includes('máquina') || t.includes('marcenaria') ||
        t.includes('freezer') || t.includes('lavar') || t.includes('móvel')) {
      return 'service_selected';
    }
  }
  
  if (currentStage === 'service_selected') {
    if (t.includes('centro') || t.includes('jardim') || t.includes('vila') ||
        t.includes('bairro') || t.includes('zona')) {
      return 'neighborhood_informed';
    }
  }
  
  if (currentStage === 'neighborhood_informed') {
    if (t.includes('amanhã') || t.includes('sábado') || t.includes('hoje') ||
        t.includes('segunda') || t.includes('terça') || t.includes('manhã') || t.includes('tarde')) {
      return 'date_selected';
    }
  }
  
  if (currentStage === 'date_selected') {
    if (t.includes('rua') || t.includes('av') || t.includes('avenida') ||
        t.includes('numero') || t.includes('número') || t.includes('casa') || t.includes('ap')) {
      return 'awaiting_confirmation';
    }
  }
  
  if (currentStage === 'awaiting_confirmation') {
    if (t.includes('ok') || t.includes('confirmo') || t.includes('pode ser') ||
        t.includes('combinado') || t.includes('fechado')) {
      return 'appointment_confirmed';
    }
  }
  
  return currentStage || 'first_contact';
}

// Notifica técnico
async function notifyTechnician(customer, phone, customerName) {
  try {
    if (!customer.service) return;
    
    const techs = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/tecnicos?especialidade=eq.${customer.service}&select=*`, {
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
      }
    }).then(r => r.json());
    
    if (!techs || techs.length === 0) {
      console.log('⚠️ Nenhum técnico encontrado para:', customer.service);
      return;
    }
    
    const tech = techs[0]; // Pega o primeiro disponível
    
    const message = `🚨 *NOVO AGENDAMENTO*

👤 *Cliente:* ${customerName}
📱 *Telefone:* ${phone}
🔧 *Serviço:* ${customer.service}
📍 *Bairro:* ${customer.neighborhood || 'Não informado'}
📅 *Data:* ${new Date().toLocaleDateString('pt-BR')}

Por favor, confirme disponibilidade e entre em contato com o cliente.

Responda *CONFIRMADO* quando estiver a caminho.`;
    
    await sendWhatsAppMessage(tech.whatsapp, message);
    console.log(`   📲 Técnico ${tech.nome} notificado`);
    
  } catch (error) {
    console.error('Erro notificar técnico:', error);
  }
}

// Notifica Telegram
async function notifyTelegram(name, phone, message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.log('⚠️ Telegram não configurado');
    return;
  }
  
  try {
    const text = `🆘 *INTERVEÇÃO NECESSÁRIA*

👤 *${name}*
📱 ${phone}
💬 "${message.substring(0, 150)}${message.length > 150 ? '...' : ''}"

👉 [Abrir Intervenção](https://oficina-robo-atendente.vercel.app/intervencao?telefone=${phone})`;
    
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    
  } catch (error) {
    console.error('Erro notificar Telegram:', error);
  }
}

// FUNÇÕES SUPABASE

async function getCustomer(phone) {
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/clientes?telefone=eq.${phone}&select=*`, {
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    return data && data[0] ? data[0] : null;
  } catch (e) {
    console.error('Erro getCustomer:', e);
    return null;
  }
}

async function createCustomer(phone, name) {
  try {
    await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/clientes`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telefone: phone,
        nome: name,
        stage: 'first_contact',
        created_at: new Date().toISOString()
      })
    });
    return { phone, name, stage: 'first_contact' };
  } catch (e) {
    console.error('Erro createCustomer:', e);
    return null;
  }
}

async function updateCustomer(phone, data) {
  try {
    await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/clientes?telefone=eq.${phone}`, {
      method: 'PATCH',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.error('Erro updateCustomer:', e);
  }
}

async function saveMessage(phone, origin, text) {
  try {
    await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/historico`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telefone: phone,
        origem: origin,
        mensagem: text,
        data: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Erro saveMessage:', e);
  }
}

async function createIntervention(phone, name, message, stage) {
  try {
    await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/intervencoes`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telefone: phone,
        nome: name,
        mensagem: message,
        stage: stage || 'unknown',
        status: 'pending',
        data: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Erro createIntervention:', e);
  }
}

async function getPricesForService(service) {
  if (!service) return null;
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/precos?servico=eq.${service}&select=*`, {
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    
    return data.map(p => `- ${p.bairro}: R$ ${p.valor}`).join('\n');
  } catch (e) {
    return null;
  }
}

async function getAllPrices() {
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/precos?select=*&order=bairro`, {
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    
    return data.map(p => `• ${p.bairro} (${p.servico}): R$ ${p.valor}`).join('\n');
  } catch (e) {
    return null;
  }
}

async function getAllTechnicians() {
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/tecnicos?select=*`, {
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    
    return data.map(t => `• ${t.nome} - ${t.especialidade}`).join('\n');
  } catch (e) {
    return null;
  }
}

async function getRelevantScripts(text) {
  try {
    // Busca scripts que podem ser relevantes (simplificado)
    const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/scripts?select=*&limit=3`, {
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
      }
    });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    
    return data.map(s => `Situação: ${s.situacao}\nResposta: ${s.resposta}`).join('\n\n');
  } catch (e) {
    return null;
  }
}

// Envia mensagem WhatsApp
async function sendWhatsAppMessage(phone, message) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_ID_NUMERO;
  
  if (!token || !phoneId) {
    console.error('❌ WhatsApp não configurado');
    return false;
  }
  
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: message }
      })
    });
    
    const data = await res.json();
    
    if (data.error) {
      console.error('WhatsApp API error:', data.error);
      return false;
    }
    
    return true;
    
  } catch (e) {
    console.error('Erro sendWhatsAppMessage:', e);
    return false;
  }
}
