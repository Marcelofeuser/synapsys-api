// ─── Roteamento automático de profundidade (Sol/Terra/Luna) ───
// Até 23/08/2026 o seletor de modelo no header do chat era 100% manual —
// a pessoa escolhia Sol/Terra/Luna toda vez, num dropdown. A landing page
// sempre prometeu que "a Synapsys decide sozinha quando pensar fundo",
// mas isso nunca foi implementado — foi um descompasso real, encontrado
// testando o app ao vivo. Este módulo é o que faz a promessa virar
// realidade quando o front manda model:"auto".
//
// Estratégia em duas camadas, pensada pra não estourar custo (Sol é bem
// mais caro que Luna por mensagem — ver TIER_MODEL_LIMITS em access.js):
//   1. Heurística rápida e de custo zero — cobre os casos óbvios (pergunta
//      curtinha -> luna; stack trace/bloco de código grande/palavra-chave
//      de arquitetura -> sol) sem gastar nenhuma chamada extra de IA.
//   2. Só quando a heurística fica em dúvida, uma classificação barata
//      usando o próprio Luna (o modelo mais rápido/barato) decide entre
//      os três níveis antes da resposta de verdade começar a ser gerada.

const ORDER = ["sol", "terra", "luna"];

const SOL_KEYWORDS = [
  "arquitetura", "arquitetural", "refatora", "refatoração", "otimizar performance",
  "revisão de segurança", "vulnerabilidade", "race condition", "deadlock",
  "stack trace", "traceback", "decisão técnica", "trade-off", "escalabilidade",
  "migração de banco", "design de sistema", "concorrência", "memory leak",
];

const CODE_FENCE_RE = /```[\s\S]{0,4000}```/;
const STACK_TRACE_RE = /(Traceback \(most recent call last\)|at .+\(.+:\d+:\d+\)|Exception in thread|Uncaught \w*Error|\berror\b.*\bline \d+)/i;

// Retorna "sol"/"terra"/"luna" quando tem sinal forte o bastante pra
// decidir sem gastar chamada de IA, ou null quando fica em dúvida (aí
// quem decide é a classificação barata em classifyWithLuna).
function heuristicGuess(input) {
  const text = (input || "").trim();
  if (!text) return null;

  const lower = text.toLowerCase();

  // Bloco de código grande ou stack trace real → a pessoa já trouxe o
  // problema difícil pronto, vale a pena ir fundo.
  if (CODE_FENCE_RE.test(text) || STACK_TRACE_RE.test(text)) return "sol";
  if (SOL_KEYWORDS.some((kw) => lower.includes(kw))) return "sol";

  // Pergunta bem curta, sem código nenhum → provavelmente é rápida.
  if (text.length < 60 && !text.includes("```")) return "luna";

  // Meio-termo sem sinal forte — melhor classificar de verdade do que
  // arriscar heurística no escuro.
  return null;
}

async function classifyWithLuna(openaiProvider, input) {
  try {
    const prompt =
      'Classifique a dificuldade técnica da pergunta abaixo em exatamente uma palavra, ' +
      'sem explicação nenhuma: "sol" (muito difícil, código complexo, decisão de arquitetura), ' +
      '"terra" (médio, revisão ou escopo geral) ou "luna" (simples, rápida, factual).\n\n' +
      "Pergunta:\n" + String(input).slice(0, 2000);

    const raw = await openaiProvider(
      "Você é um classificador. Responda só com uma palavra: sol, terra ou luna.",
      prompt,
      [],
      [],
      "luna"
    );
    const guess = String(raw || "").toLowerCase().trim();
    if (ORDER.includes(guess)) return guess;
    const found = ORDER.find((key) => guess.includes(key));
    return found || "terra";
  } catch (_) {
    // Classificação falhou por qualquer motivo (rede, provider fora do ar)
    // — cai no meio-termo em vez de travar a mensagem do usuário.
    return "terra";
  }
}

// Desce de nível se o nível desejado estiver com cota esgotada, em vez de
// deixar a mensagem travar com erro de cota — a promessa é "a IA decide
// pra você", não "a IA decide e depois falha porque escolheu o nível
// errado pra sua cota atual".
function applyQuotaFallback(desired, accessRow, isBlockedByLimit) {
  if (!accessRow) return desired;
  const start = ORDER.indexOf(desired);
  const order = start >= 0 ? ORDER.slice(start).concat(ORDER.slice(0, start)) : ORDER;
  for (const key of order) {
    if (!isBlockedByLimit(accessRow, key)) return key;
  }
  return desired; // todos esgotados — o fluxo normal de cota trata o erro depois
}

async function classifyModelKey({ input, hasImages, accessRow, isBlockedByLimit, openaiProvider }) {
  // Anexo de imagem pede um nível com visão de qualquer forma — mantém o
  // meio-termo, que já é o comportamento padrão pra imagem hoje.
  let desired = hasImages ? "terra" : heuristicGuess(input);
  if (!desired) desired = await classifyWithLuna(openaiProvider, input);
  return applyQuotaFallback(desired, accessRow, isBlockedByLimit);
}

module.exports = { classifyModelKey, heuristicGuess };
