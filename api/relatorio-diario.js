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

    const resumo = `📊 Resumo do dia (${hoje})
Mensagens totais: ${total}
Clientes: ${clientes}
Respostas do robô: ${robo}`;

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
