// ENVIA RESPOSTA DO HUMANO PARA WHATSAPP
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Só aceito POST' });
  }

  const { telefone, mensagem } = req.body;

  if (!telefone || !mensagem) {
    return res.status(400).json({ erro: 'Telefone e mensagem são obrigatórios' });
  }

  try {
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_ID_NUMERO) {
      return res.status(500).json({ erro: 'WhatsApp não configurado' });
    }

    // Envia pelo WhatsApp oficial
    const resposta = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_ID_NUMERO}/messages`, {
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

    const dados = await resposta.json();
    
    if (dados.error) {
      throw new Error(dados.error.message || 'Erro WhatsApp');
    }

    // SALVA NO HISTÓRICO (com sua chave)
    const SUPABASE_URL = 'https://ehpikmqrieldplwkmyyo.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVocGlrbXFyaWVsZHBsd2tteXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMzkzMjIsImV4cCI6MjA4OTcxNTMyMn0.7q5-vcJfzqjcaiiuvDg1kMGFmWEH07bBscqKH85DN0c';

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
          origem: 'humano',
          mensagem,
          data: new Date().toISOString()
        })
      });
    } catch (e) {
      console.error('Erro salvar histórico:', e);
    }

    // Marca intervenção como resolvida
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/intervencoes?telefone=eq.${telefone}&status=eq.pendente`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'resolvido' })
      });
    } catch (e) {
      console.error('Erro marcar resolvido:', e);
    }

    res.status(200).json({ sucesso: true, id: dados.messages?.[0]?.id });

  } catch (erro) {
    console.error('Erro:', erro);
    res.status(500).json({ erro: erro.message });
  }
}
