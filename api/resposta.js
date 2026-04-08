// Quando você responde pela página de intervenção, envia pro WhatsApp
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Só aceito POST' });
  }

  const { telefone, mensagem } = req.body;

  try {
    const TOKEN = process.env.WHATSAPP_TOKEN;
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

    const dados = await resposta.json();
    
    if (dados.error) {
      throw new Error(dados.error.message);
    }

    res.status(200).json({ sucesso: true, id: dados.messages?.[0]?.id });

  } catch (erro) {
    console.error('Erro ao enviar:', erro);
    res.status(500).json({ erro: erro.message });
  }
}
