const RESPOSTAS = {
  // MUDE AQUI a saudação
  saudacao: (nome) => 
    `Olá${nome ? ' ' + nome : ''}, essa é a Central...`, // ← MUDE ESTE TEXTO
  
  // MUDE AQUI as perguntas do ar condicionado
  ar_qualificar: () =>
    `Perfeito! ...`, // ← MUDE AQUI
  
  // MUDE AQUI o valor (se mudar de 140)
  ar_valor: (btus, marca, bairro, problema) =>
    `... Visita técnica: R$140 ...`, // ← MUDE O 140
}
