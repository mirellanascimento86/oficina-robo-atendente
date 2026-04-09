export default async function handler(req, res) {
  const SUPABASE_URL = 'https://ehpikmqrieldplwkmyyo.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  try {
    // Busca dados do dia
    const hoje = new Date().toISOString().split('T')[0];

    const resAtendimentos = await fetch(`${SUPABASE_URL}/rest/v1/historico?data=gt.${hoje}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const atendimentos = await resAtendimentos.json();

    const total = atendimentos.length;
    const intervencoes = atendimentos.filter(m => m.origem === 'humano').length;

    const mensagem = `📊 *Relatório Diário - Oficina IA* (${hoje})

✅ Atendimentos realizados: ${total}
👥 Intervenções humanas: ${intervencoes}
🔧 Visitas marcadas: ${Math.round(total * 0.6)} (estimado)
🚨 Problemas não resolvidos: ${intervencoes > 0 ? intervencoes : 'Nenhum'}

O robô está funcionando bem! Qualquer dúvida, avise.

Boa noite! 🌙`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: mensagem,
        parse_mode: 'Markdown'
      })
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro no relatório' });
  }
}
