// WEBHOOK PARA WHATSAPP - VERSÃO FUNCIONAL
export default function handler(req, res) {
  // ===== VERIFICAÇÃO DO META (GET) =====
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('Verificação recebida:', { mode, token, challenge });
    
    // Verifica se é válido
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('✅ Webhook verificado com sucesso!');
      return res.status(200).send(challenge);
    }
    
    console.log('❌ Token inválido. Esperado:', process.env.VERIFY_TOKEN, 'Recebido:', token);
    return res.status(403).send('Token inválido');
  }
  
  // ===== RECEBER MENSAGENS (POST) =====
  if (req.method === 'POST') {
    console.log('Mensagem recebida:', JSON.stringify(req.body, null, 2));
    
    // Processa em background (não espera para responder)
    processarMensagem(req.body).catch(console.error);
    
    // Responde imediatamente pro Meta (evita timeout)
    return res.status(200).json({ status: 'recebido' });
  }
  
  // Outros métodos não permitidos
  return res.status(405).send('Method not allowed');
}

// Processa mensagem em background
async function processarMensagem(body) {
  try {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;
    
    const telefone = message.from;
    const texto = message.text?.body || '';
    
    console.log(`Mensagem de ${telefone}: ${texto}`);
    
    // AQUI VOCÊ COLOCA SUA LÓGICA COM GROQ
    // Por enquanto, resposta simples para testar:
    await enviarWhatsApp(telefone, `Recebi: ${texto}`);
    
  } catch (erro) {
    console.error('Erro ao processar:', erro);
  }
}

// Função para enviar mensagem
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
    console.log('Resposta enviada:', dados);
    
  } catch (erro) {
    console.error('Erro ao enviar:', erro);
  }
}
