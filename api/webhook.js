export default async function handler(req, res) {
  // ── VERIFICAÇÃO DO WEBHOOK (GET) ──────────────────────────────────────────
  if (req.method === 'GET') {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
 
    // Log para debug no Vercel
    console.log('WEBHOOK VERIFY →', { mode, token, VERIFY_TOKEN, match: token === VERIFY_TOKEN });
 
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verificado com sucesso');
      return res.status(200).send(challenge);
    }
 
    console.log('❌ Token não bateu — recebido:', token, '| esperado:', VERIFY_TOKEN);
    return res.status(403).send('Forbidden');
  }
 
  // ── RECEBE MENSAGENS (POST) ───────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).end();
 
  try {
    const body = req.body;
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ?? null;
 
    if (!message) return res.status(200).json({ ok: true, message: 'No message' });
 
    const phone       = message.from;
    const messageType = message.type;
 
    await salvarHistorico(phone, JSON.stringify(message), 'cliente');
 
    // ── Verifica intervenção humana ativa ────────────────────────────────────
    const intervencaoAtiva = await verificarIntervencao(phone);
    if (intervencaoAtiva) {
      console.log('🤝 Intervenção humana ativa para', phone);
      return res.status(200).json({ ok: true, human: true });
    }
 
    let userText    = '';
    let mediaContext = '';
 
    // ── Processa tipo de mensagem ────────────────────────────────────────────
    if (messageType === 'text') {
      userText = message.text?.body || '';
    }
 
    if (messageType === 'audio' || messageType === 'voice') {
      const mediaId    = message.audio?.id || message.voice?.id;
      const audioBuffer = await baixarMidiaWhatsApp(mediaId);
      const transcript  = await transcreverAudio(audioBuffer);
      userText     = transcript || '[áudio sem transcrição]';
      mediaContext = 'O usuário enviou um áudio que foi transcrito.';
    }
 
    if (messageType === 'image') {
      const mediaId   = message.image?.id;
      const mediaInfo = await obterMediaInfoWhatsApp(mediaId);
      const imageText = await analisarImagemComGroq(mediaInfo.url);
      userText     = message.image?.caption || '[imagem enviada]';
      mediaContext = `O usuário enviou uma imagem. Análise visual: ${imageText}`;
    }
 
    if (messageType === 'video') {
      const mediaId   = message.video?.id;
      const mediaInfo = await obterMediaInfoWhatsApp(mediaId);
      userText     = message.video?.caption || '[vídeo enviado]';
      mediaContext = `O usuário enviou um vídeo. URL: ${mediaInfo.url}`;
    }
 
    // ── Disparo de intervenção ───────────────────────────────────────────────
    if (precisaIntervencao(userText, mediaContext)) {
      const msgHumana = 'Vou chamar uma pessoa da nossa equipe para te ajudar agora mesmo. Um instante! 😊';
      await enviarWhatsApp(phone, msgHumana);
      await salvarHistorico(phone, msgHumana, 'robo');
      await registrarIntervencao(phone, userText);
      await avisarTelegram(`⚠️ *INTERVENÇÃO NECESSÁRIA*\nTelefone: ${phone}\nTipo: ${messageType}\nMensagem: ${userText}`);
      return res.status(200).json({ ok: true, intervention: true });
    }
 
    // ── Busca histórico da conversa (memória) ────────────────────────────────
    const historico = await buscarHistorico(phone);
 
    // ── Carrega config + técnicos + bairros ──────────────────────────────────
    const config    = await carregarConfiguracao();
    const tecnicos  = await carregarTecnicos();
    const bairros   = await carregarBairros();
    const servicos  = await carregarServicos();
 
    const personalidade = config?.personalidade || 'educado, rápido, simpático e profissional';
    const scripts       = config?.scripts || '';
    const regras        = config?.regras  || '';
 
    const listaTecnicos = tecnicos.map(t =>
      `- ${t.nome} | Especialidade: ${t.especialidade} | WhatsApp: ${t.whatsapp}`
    ).join('\n') || 'Nenhum técnico cadastrado ainda.';
 
    const listaBairros = bairros.map(b =>
      `- ${b.nome}: visita R$${b.valor_visita}`
    ).join('\n') || 'Consultar valor de visita por bairro.';
 
    const listaServicos = servicos.map(s =>
      `- ${s.nome}: ${s.descricao || ''} | Visita: R$${s.valor_visita || 'a consultar'}`
    ).join('\n') || 'Serviços: refrigeração, máquina de lavar, marcenaria, reforma.';
 
    const systemPrompt = `Você é Ana, atendente virtual da RC Construção e Reforma.
IMPORTANTE: Nunca diga que é robô, IA ou assistente virtual. Você é humana.
 
Personalidade: ${personalidade}
${scripts ? `Scripts de atendimento:\n${scripts}` : ''}
${regras  ? `Regras:\n${regras}` : ''}
 
SERVIÇOS QUE ATENDEMOS:
${listaServicos}
 
TÉCNICOS DISPONÍVEIS:
${listaTecnicos}
 
BAIRROS E VALORES DE VISITA:
${listaBairros}
 
FLUXO DE ATENDIMENTO:
1. Cumprimente o cliente pelo nome se souber.
2. Identifique o tipo de serviço (refrigeração, máquina de lavar, marcenaria, reforma).
3. Pergunte o bairro e descrição do problema (peça foto se ajudar).
4. Informe o valor da visita do técnico para o bairro do cliente.
5. Agende para o dia mais próximo disponível (pode ser hoje).
6. Informe que o pagamento da visita é feito no ato.
7. Após a visita, o técnico passa o orçamento.
8. Repasse informações entre técnico e cliente fazendo a ponte.
9. Tente negociar com jogo de cintura se cliente questionar preço — não perca o serviço.
10. Nunca deixe um cliente sem resposta.
 
${mediaContext ? `Contexto de mídia: ${mediaContext}` : ''}
 
Responda em português do Brasil, de forma natural e humana.`;
 
    // ── Monta mensagens com histórico (memória) ──────────────────────────────
    const mensagensHistorico = historico.slice(-10).map(h => ({
      role: h.origem === 'cliente' ? 'user' : 'assistant',
      content: h.mensagem
    }));
 
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama3-70b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          ...mensagensHistorico,
          { role: 'user', content: userText }
        ],
        temperature: 0.75,
        max_tokens: 700
      })
    });
 
    const groqData = await groqRes.json();
    const resposta = groqData?.choices?.[0]?.message?.content
      || 'Recebi sua mensagem! Um momento que já te respondo 😊';
 
    await enviarWhatsApp(phone, resposta);
    await salvarHistorico(phone, resposta, 'robo');
 
    // ── Atualiza planilha de atendimentos ────────────────────────────────────
    await atualizarAtendimento(phone, userText, resposta);
 
    return res.status(200).json({ ok: true });
 
  } catch (erro) {
    console.error('❌ Erro no webhook:', erro);
    await avisarTelegram(`❌ Erro no webhook:\n${erro?.message || erro}`).catch(() => {});
    return res.status(500).json({ error: 'internal_error' });
  }
}
 
// ── FUNÇÕES AUXILIARES ────────────────────────────────────────────────────────
 
async function verificarIntervencao(telefone) {
  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/intervencoes?telefone=eq.${telefone}&status=eq.pendente&select=id`,
      { headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` } }
    );
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch { return false; }
}
 
async function registrarIntervencao(telefone, mensagem) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/intervencoes`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ telefone, mensagem, status: 'pendente', data: new Date().toISOString() })
  });
}
 
async function carregarConfiguracao() {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config?select=*&limit=1`, {
      headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` }
    });
    const data = await res.json();
    return data?.[0] || {};
  } catch { return {}; }
}
 
async function carregarTecnicos() {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/tecnicos?select=*`, {
      headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` }
    });
    return await res.json() || [];
  } catch { return []; }
}
 
async function carregarBairros() {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bairros?select=*`, {
      headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` }
    });
    return await res.json() || [];
  } catch { return []; }
}
 
async function carregarServicos() {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/servicos?select=*`, {
      headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` }
    });
    return await res.json() || [];
  } catch { return []; }
}
 
async function buscarHistorico(telefone) {
  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/historico?telefone=eq.${telefone}&order=data.asc&limit=20`,
      { headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` } }
    );
    return await res.json() || [];
  } catch { return []; }
}
 
async function salvarHistorico(telefone, mensagem, origem) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/historico`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ telefone, mensagem, origem, data: new Date().toISOString() })
  });
}
 
async function atualizarAtendimento(telefone, mensagemCliente, respostaRobo) {
  try {
    // Verifica se já existe registro do cliente hoje
    const hoje = new Date().toISOString().slice(0, 10);
    const checkRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/atendimentos?telefone=eq.${telefone}&data_inicio=gte.${hoje}T00:00:00Z&select=id`,
      { headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` } }
    );
    const existing = await checkRes.json();
 
    if (!existing || existing.length === 0) {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/atendimentos`, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          telefone,
          primeira_mensagem: mensagemCliente,
          status: 'em_atendimento',
          data_inicio: new Date().toISOString()
        })
      });
    }
  } catch (e) {
    console.error('Erro ao atualizar atendimento:', e);
  }
}
 
function precisaIntervencao(texto = '', mediaContext = '') {
  const t = `${texto} ${mediaContext}`.toLowerCase();
  return [
    'falar com humano', 'falar com pessoa', 'atendente humano',
    'supervisora', 'supervisor', 'gerente',
    'urgente', 'emergência', 'emergencia',
    'reclamação', 'reclamacao', 'processo',
    'ação judicial', 'acao judicial', 'procon'
  ].some(palavra => t.includes(palavra));
}
 
async function enviarWhatsApp(telefone, mensagem) {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefone,
        type: 'text',
        text: { body: mensagem }
      })
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp send failed: ${err}`);
  }
  return res.json();
}
 
async function avisarTelegram(texto) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'Markdown' })
  });
}
 
async function obterMediaInfoWhatsApp(mediaId) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
  });
  if (!res.ok) throw new Error(`Media info failed: ${await res.text()}`);
  return res.json();
}
 
async function baixarMidiaWhatsApp(mediaId) {
  const info = await obterMediaInfoWhatsApp(mediaId);
  const res  = await fetch(info.url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
  });
  if (!res.ok) throw new Error(`Media download failed: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
 
async function transcreverAudio(audioBuffer) {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'audio.ogg');
  form.append('model', 'whisper-large-v3-turbo');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form
  });
  if (!res.ok) throw new Error(`Transcription failed: ${await res.text()}`);
  return (await res.json()).text || '';
}
 
async function analisarImagemComGroq(imageUrl) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.2-90b-vision-preview',
      messages: [
        { role: 'system', content: 'Analise a imagem e descreva objetivamente em português o que está danificado ou o problema visível, focando em aspectos técnicos de reparo.' },
        { role: 'user', content: [{ type: 'text', text: 'O que você vê nesta imagem?' }, { type: 'image_url', image_url: { url: imageUrl } }] }
      ],
      temperature: 0.2,
      max_tokens: 400
    })
  });
  if (!res.ok) throw new Error(`Vision failed: ${await res.text()}`);
  return (await res.json())?.choices?.[0]?.message?.content || '';
}
