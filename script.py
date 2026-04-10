from textwrap import dedent
import os, json
os.makedirs('output', exist_ok=True)
files = {
'output/vercel.json': dedent('''
{
  "crons": [
    {
      "path": "/api/relatorio-diario",
      "schedule": "0 22 * * *"
    }
  ]
}
''').strip()+"\n",
'output/api_webhook.js': dedent('''
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

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.status(200).json({ ok: true });

    const phone = message.from;
    const type = message.type;
    const text = message.text?.body || '';

    const userText = type === 'text' ? text : `[${type}]`;

    const configRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config?select=*`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });
    const config = await configRes.json();

    const personalidade = config?.[0]?.personalidade || 'educado, rápido e claro';
    const scripts = config?.[0]?.scripts || '';
    const regras = config?.[0]?.regras || '';

    const systemPrompt = `Você é um assistente de atendimento da RC Construção e Reforma.\nPersonalidade: ${personalidade}\nScripts: ${scripts}\nRegras: ${regras}\n\nResponda em português do Brasil, com naturalidade, sem enrolação. Se precisar de intervenção humana, sinalize claramente.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const groqData = await groqRes.json();
    let resposta = groqData?.choices?.[0]?.message?.content || 'Recebi sua mensagem e já vou responder.';

    if (/(humano|atendente|supervisora|suporte|ajuda)/i.test(userText)) {
      resposta = 'Vou chamar uma pessoa da equipe para te ajudar agora.';
      await avisarTelegramIntervencao(phone, userText);
    }

    await enviarWhatsApp(phone, resposta);
    await salvarHistorico(phone, userText, 'cliente');
    await salvarHistorico(phone, resposta, 'robo');

    return res.status(200).json({ ok: true });
  } catch (erro) {
    console.error('Erro no webhook:', erro);
    return res.status(500).json({ error: 'internal_error' });
  }
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

async function enviarWhatsApp(telefone, mensagem) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'text',
      text: { body: mensagem }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp send failed: ${err}`);
  }
}

async function avisarTelegramIntervencao(telefone, texto) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const msg = `⚠️ Intervenção necessária\nTelefone: ${telefone}\nMensagem: ${texto}`;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: msg })
  });
}
''').strip()+"\n",
'output/api_test_chat.js': dedent('''
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ resposta: 'Method not allowed' });
  const { mensagem } = req.body || {};
  if (!mensagem) return res.status(400).json({ resposta: 'Mensagem vazia' });

  try {
    const configRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/config?select=*`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });
    const config = await configRes.json();

    const personalidade = config?.[0]?.personalidade || 'educado e rápido';
    const scripts = config?.[0]?.scripts || '';
    const regras = config?.[0]?.regras || '';

    const systemPrompt = `Você é um atendente profissional da RC Construção e Reforma.\nPersonalidade: ${personalidade}\nScripts: ${scripts}\nRegras: ${regras}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: mensagem }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await groqRes.json();
    const resposta = data?.choices?.[0]?.message?.content || 'Desculpe, estou com dificuldade técnica no momento. Pode repetir?';
    return res.status(200).json({ resposta });
  } catch (error) {
    console.error('Erro no test-chat:', error);
    return res.status(200).json({ resposta: 'Desculpe, estou com dificuldade técnica no momento. Pode repetir?' });
  }
}
''').strip()+"\n",
'output/api_relatorio_diario.js': dedent('''
export default async function handler(req, res) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);

    const historicoRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/historico?select=*&data=gte.${hoje}T00:00:00.000Z&data=lt.${hoje}T23:59:59.999Z`, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });
    const historico = await historicoRes.json();

    const total = historico?.length || 0;
    const clientes = historico?.filter(x => x.origem === 'cliente').length || 0;
    const robo = historico?.filter(x => x.origem === 'robo').length || 0;

    const resumo = `📊 Resumo do dia (${hoje})\nMensagens totais: ${total}\nClientes: ${clientes}\nRespostas do robô: ${robo}`;

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: resumo })
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Erro relatorio diario:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}
''').strip()+"\n",
'output/login_html': dedent('''
<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Login</title></head>
<body style="font-family:sans-serif;padding:24px">
<h2>Login</h2>
<p>Use autenticação no backend; esta tela é apenas placeholder.</p>
</body></html>
''').strip()+"\n"
}
for path, content in files.items():
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
print('files_written', list(files.keys()))
