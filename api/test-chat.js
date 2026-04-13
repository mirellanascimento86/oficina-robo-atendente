// api/test-chat.js
export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).json({ resposta: ‘Method not allowed’ });

const { mensagem } = req.body || {};
if (!mensagem) return res.status(400).json({ resposta: ‘Mensagem vazia’ });

const SB  = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;

try {
// Carrega config
const configRes = await fetch(`${SB}/rest/v1/config?select=*&limit=1`, {
headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
});
const config = await configRes.json();

```
// Carrega técnicos
const tecRes = await fetch(`${SB}/rest/v1/tecnicos?select=*`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
});
const tecnicos = await tecRes.json() || [];

// Carrega bairros
const bairRes = await fetch(`${SB}/rest/v1/bairros?select=*`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
});
const bairros = await bairRes.json() || [];

// Carrega serviços
const servRes = await fetch(`${SB}/rest/v1/servicos?select=*`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
});
const servicos = await servRes.json() || [];

const personalidade = config?.[0]?.personalidade || 'educado, rápido e profissional';
const scripts       = config?.[0]?.scripts || '';
const regras        = config?.[0]?.regras  || '';

const listaTecnicos = tecnicos.map(t =>
  `- ${t.nome} | ${t.especialidade} | WhatsApp: ${t.whatsapp}`
).join('\n') || 'Nenhum técnico cadastrado.';

const listaBairros = bairros.map(b =>
  `- ${b.nome}: R$${b.valor_visita}`
).join('\n') || 'Consultar valor por bairro.';

const listaServicos = servicos.map(s =>
  `- ${s.nome}: ${s.descricao || ''} | Visita: R$${s.valor_visita || 'a consultar'}`
).join('\n') || 'Refrigeração, máquina de lavar, marcenaria, reforma.';

const systemPrompt = `Você é Ana, atendente da RC Construção e Reforma.
```

NUNCA diga que é IA ou robô. Você é humana.
Personalidade: ${personalidade}
${scripts ? `Scripts:\n${scripts}` : ‘’}
${regras  ? `Regras:\n${regras}`   : ‘’}

SERVIÇOS: ${listaServicos}
TÉCNICOS: ${listaTecnicos}
BAIRROS E VISITAS: ${listaBairros}

Responda em português do Brasil de forma natural e humana.`;

```
const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'llama3-70b-8192',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: mensagem }
    ],
    temperature: 0.75,
    max_tokens: 500
  })
});

const data = await groqRes.json();
const resposta = data?.choices?.[0]?.message?.content
  || 'Desculpe, estou com dificuldade técnica no momento. Pode repetir?';

return res.status(200).json({ resposta });
```

} catch (error) {
console.error(‘Erro no test-chat:’, error);
return res.status(200).json({ resposta: ‘Desculpe, estou com dificuldade técnica no momento. Pode repetir?’ });
}
}
