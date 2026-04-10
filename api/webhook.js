export default async function handler(req, res) {
  if (req.method === 'GET') {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const body = req.body;

    const message =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
      null;

    if (!message) {
      return res.status(200).json({ ok: true, message: 'No message' });
    }

    const phone = message.from;
    const messageType = message.type;

    await salvarHistorico(phone, JSON.stringify(message), 'cliente');

    let userText = '';
    let mediaContext = '';

    if (messageType === 'text') {
      userText = message.text?.body || '';
    }

    if (messageType === 'audio' || messageType === 'voice') {
      const mediaId = message.audio?.id || message.voice?.id;
      const mediaBuffer = await baixarMidiaWhatsApp(mediaId);
      const transcript = await transcreverAudio(mediaBuffer);
      userText = transcript || '[áudio sem transcrição]';
      mediaContext = 'O usuário enviou um áudio.';
    }

    if (messageType === 'image') {
      const mediaId = message.image?.id;
      const mediaInfo = await obterMediaInfoWhatsApp(mediaId);
      const imageText = await analisarImagemComGroq(mediaInfo.url);
      userText = message.image?.caption || '[imagem enviada]';
      mediaContext = `O usuário enviou uma imagem. Análise: ${imageText}`;
    }

    if (messageType === 'video') {
      const mediaId = message.video?.id;
      const mediaInfo = await obterMediaInfoWhatsApp(mediaId);
      userText = message.video?.caption || '[vídeo enviado]';
      mediaContext = `O usuário enviou um vídeo. URL: ${mediaInfo.url}`;
    }

    const config = await carregarConfiguracao();
    const personalidade = config?.personalidade || 'educado, rápido e claro';
    const scripts = config?.scripts || '';
    const regras = config?.regras || '';

    const systemPrompt = `
Você é um assistente de atendimento da RC Construção e Reforma.
Personalidade: ${personalidade}
Scripts: ${scripts}
Regras: ${regras}

Contexto adicional de mídia:
${mediaContext}

Responda em português do Brasil.
Se o cliente pedir humano, supervisora, ajuda urgente, orçamento complexo ou intervenção, avise que vai chamar alguém da equipe.
`;

    if (precisaIntervencao(userText, mediaContext)) {
      const msgHumana = 'Vou chamar uma pessoa da equipe para te ajudar agora.';
      await enviarWhatsApp(phone, msgHumana);
      await salvarHistorico(phone, msgHumana, 'robo');
      await avisarTelegramIntervencao(phone, userText, messageType);
      return res.status(200).json({ ok: true, intervention: true });
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        temperature: 0.7,
        max_tokens: 700
      })
    });

    const groqData = await groqRes.json();
    let resposta =
      groqData?.choices?.[0]?.message?.content ||
      'Recebi sua mensagem e já vou te responder.';

    await enviarWhatsApp(phone, resposta);
    await salvarHistorico(phone, resposta, 'robo');

    return res.status(200).json({ ok: true });
  } catch (erro) {
    console.error('Erro no webhook:', erro);

    try {
      await avisarTelegramErro(String(erro?.message || erro));
    } catch (e) {}

    return res.status(500).json({ error: 'internal_error' });
  }
}

async function carregarConfiguracao() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config?select=*&limit=1`, {
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    }
  });

  const data = await res.json();
  return data?.[0] || {};
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
    body: JSON.stringify({
      telefone,
      mensagem,
      origem,
      data: new Date().toISOString()
    })
  });
}

function precisaIntervencao(texto = '', mediaContext = '') {
  const t = `${texto} ${mediaContext}`.toLowerCase();

  return (
    t.includes('humano') ||
    t.includes('atendente') ||
    t.includes('supervisora') ||
    t.includes('supervisor') ||
    t.includes('ajuda') ||
    t.includes('urgente') ||
    t.includes('reclamação') ||
    t.includes('reclamacao') ||
    t.includes('processo') ||
    t.includes('ação judicial') ||
    t.includes('acao judicial')
  );
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

async function avisarTelegramIntervencao(telefone, texto, tipo) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const msg = `⚠️ Intervenção necessária\nTelefone: ${telefone}\nTipo: ${tipo}\nMensagem: ${texto}`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: msg
    })
  });
}

async function avisarTelegramErro(textoErro) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const msg = `❌ Erro no webhook:\n${textoErro}`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: msg
    })
  });
}

async function obterMediaInfoWhatsApp(mediaId) {
  const metaRes = await fetch(
    `https://graph.facebook.com/v20.0/${mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
      }
    }
  );

  if (!metaRes.ok) {
    const err = await metaRes.text();
    throw new Error(`Media info failed: ${err}`);
  }

  return metaRes.json();
}

async function baixarMidiaWhatsApp(mediaId) {
  const info = await obterMediaInfoWhatsApp(mediaId);

  const fileRes = await fetch(info.url, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
    }
  });

  if (!fileRes.ok) {
    const err = await fileRes.text();
    throw new Error(`Media download failed: ${err}`);
  }

  return Buffer.from(await fileRes.arrayBuffer());
}

async function transcreverAudio(audioBuffer) {
  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
  form.append('file', blob, 'audio.ogg');
  form.append('model', process.env.WHISPER_MODEL || 'whisper-large-v3-turbo');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: form
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Audio transcription failed: ${err}`);
  }

  const data = await res.json();
  return data.text || '';
}

async function analisarImagemComGroq(imageUrl) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.GROQ_VISION_MODEL || 'llama-3.2-90b-vision-preview',
      messages: [
        {
          role: 'system',
          content: 'Analise a imagem de forma objetiva e diga o que aparece nela em português do Brasil.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analise esta imagem.' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 400
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision analysis failed: ${err}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}
