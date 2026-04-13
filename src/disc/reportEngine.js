const FACTOR_NAMES = {
  D: "Dominância",
  I: "Influência",
  S: "Estabilidade",
  C: "Conformidade",
};

const PROFILE_LIBRARY = {
  D: {
    title: "Executor",
    summary:
      "Perfil orientado a resultado, velocidade e enfrentamento de desafios. Tende a decidir com rapidez, assumir protagonismo e atuar melhor quando percebe autonomia, metas claras e espaço para avançar.",
    communication:
      "Comunicação direta, objetiva e orientada a decisão. Costuma ir ao ponto, valorizar eficiência verbal e preferir conversas que avancem rapidamente para ação.",
    leadership:
      "Lidera com senso de direção, cobrança por resultado e impulso de execução. Em contextos favoráveis, acelera entregas e gera movimento no time.",
    decision:
      "Decide com rapidez, priorizando impacto, controle e avanço. Pode assumir risco calculado quando percebe ganho competitivo.",
    strengths: ["agilidade", "assertividade", "coragem", "competitividade"],
    values: ["autonomia", "desafio", "resultado", "objetividade", "velocidade"],
    d: {
      description:
        "A Dominância elevada indica inclinação para confronto produtivo, decisão rápida e foco em resultado. A pessoa tende a agir sob senso de urgência e assumir controle em cenários ambíguos.",
      manifestations: [
        "Assume a frente quando percebe lentidão ou indefinição.",
        "Questiona obstáculos e tende a pressionar por avanço.",
        "Prefere autonomia para decidir e executar.",
        "Mantém foco em metas, prazos e desempenho concreto.",
      ],
      strengths: ["iniciativa", "determinação", "foco em meta"],
      attention: ["tom excessivamente duro", "baixa tolerância ao ritmo alheio"],
      boost:
        "Canalize a energia de execução para metas claras, com checkpoints curtos e critérios objetivos. O fator D ganha potência quando combina coragem com disciplina relacional.",
    },
    i: {
      description:
        "No fator Influência, tende a se comunicar de forma funcional e persuasiva quando isso acelera resultado, sem necessariamente buscar sociabilidade elevada como prioridade central.",
      manifestations: [
        "Convence pelo senso de direção e segurança ao falar.",
        "Mobiliza pessoas quando enxerga ganho prático.",
        "Pode ser breve e pouco ritualístico nas interações.",
        "Prefere conversas com propósito claro e encaminhamento objetivo.",
      ],
      strengths: ["persuasão objetiva", "clareza", "energia social funcional"],
      attention: ["pouca paciência com detalhes emocionais", "risco de soar impositivo"],
      boost:
        "Para ampliar o fator I, equilibre firmeza com conexão. Explicar o porquê das decisões e reconhecer contribuições aumenta adesão sem reduzir autoridade.",
    },
    s: {
      description:
        "No fator Estabilidade, costuma tolerar menos rotina excessiva e pode buscar ambientes dinâmicos, com mudança, superação e margem para agir sem amarras.",
      manifestations: [
        "Mostra desconforto quando o ritmo é lento demais.",
        "Prefere progresso visível a manutenção prolongada.",
        "Adapta-se rápido em cenários de pressão.",
      ],
      strengths: ["resposta rápida", "resiliência competitiva"],
      attention: ["impaciência com constância", "risco de pressionar excessivamente"],
    },
    c: {
      description:
        "No fator Conformidade, tende a valorizar regra e processo apenas quando eles melhoram desempenho. Pode questionar padrões que pareçam burocráticos ou lentos.",
      manifestations: [
        "Contesta processos sem ganho percebido.",
        "Busca autonomia maior do que padronização rígida.",
        "Tolera erro inicial se isso acelerar aprendizado prático.",
      ],
      strengths: ["pragmatismo", "foco no que funciona"],
      attention: ["risco de ignorar detalhe crítico"],
    },
  },
  I: {
    title: "Influente",
    summary:
      "Perfil expansivo, comunicativo e mobilizador. Tende a gerar conexão, entusiasmo e engajamento, atuando melhor em contextos com interação, reconhecimento e espaço para influenciar pessoas.",
    communication:
      "Comunicação calorosa, expressiva e acessível. Costuma persuadir por proximidade, energia e narrativa envolvente.",
    leadership:
      "Lidera pelo engajamento, inspiração e capacidade de mobilizar pessoas em torno de ideias, ambiente positivo e relacionamento.",
    decision:
      "Decide considerando impacto relacional, aceitação e oportunidade. Pode agir com otimismo e rapidez quando percebe adesão do grupo.",
    strengths: ["carisma", "entusiasmo", "persuasão", "networking"],
    values: ["reconhecimento", "interação", "liberdade", "otimismo", "visibilidade"],
    d: {
      description:
        "No fator Dominância, costuma acionar firmeza quando precisa defender ideias, liderar iniciativas ou sustentar protagonismo em situações competitivas.",
      manifestations: [
        "Defende suas propostas com energia.",
        "Assume visibilidade com naturalidade.",
        "Pode decidir rápido quando há entusiasmo coletivo.",
        "Busca protagonismo em interações estratégicas.",
      ],
      strengths: ["presença", "iniciativa social", "ousadia"],
      attention: ["risco de impulsividade", "dificuldade de aprofundar"],
      boost:
        "Aumente potência do fator D conectando carisma a execução disciplinada. Quando o discurso vem acompanhado de follow-up firme, a influência ganha credibilidade estrutural.",
    },
    i: {
      description:
        "A Influência elevada indica necessidade maior de expressão, conexão, reconhecimento e participação. A pessoa tende a energizar o ambiente e facilitar adesão por meio da relação.",
      manifestations: [
        "Cria rapport com facilidade.",
        "Estimula o grupo por entusiasmo e presença.",
        "Usa narrativa e espontaneidade para convencer.",
        "Busca ambientes vivos, colaborativos e com troca frequente.",
      ],
      strengths: ["comunicação", "engajamento", "otimismo"],
      attention: ["excesso de informalidade", "baixa consistência na rotina"],
      boost:
        "Potencialize o fator I combinando presença social com clareza de compromisso. Estruturar combinados, prazos e prioridades evita que a energia se disperse.",
    },
    s: {
      description:
        "No fator Estabilidade, pode alternar entre necessidade de vínculo e busca por novidade. Tende a sustentar constância melhor quando há troca humana positiva.",
      manifestations: [
        "Mantém energia quando o ambiente é relacionalmente saudável.",
        "Pode perder ritmo em tarefas solitárias e repetitivas.",
        "Gosta de colaboração e reconhecimento recorrente.",
      ],
      strengths: ["proximidade", "clima leve"],
      attention: ["dificuldade com repetição silenciosa"],
    },
    c: {
      description:
        "No fator Conformidade, pode priorizar espontaneidade em vez de estrutura rígida. Regras funcionam melhor quando são claras, simples e percebidas como úteis.",
      manifestations: [
        "Evita excesso de formalismo.",
        "Prefere flexibilidade a padronização intensa.",
        "Pode negligenciar detalhe quando a interação vira prioridade.",
      ],
      strengths: ["adaptabilidade", "leveza"],
      attention: ["risco de falha por descuido"],
    },
  },
  S: {
    title: "Estável",
    summary:
      "Perfil consistente, cooperativo e previsível. Tende a sustentar ritmo, estabilidade emocional e suporte ao grupo, atuando melhor em ambientes respeitosos, claros e sem rupturas desnecessárias.",
    communication:
      "Comunicação calma, respeitosa e ponderada. Costuma ouvir com atenção, responder com equilíbrio e evitar confronto desnecessário.",
    leadership:
      "Lidera por confiança, constância e apoio. Gera segurança para a equipe e costuma fortalecer coesão, continuidade e clima relacional estável.",
    decision:
      "Decide após ponderação, buscando segurança, previsibilidade e baixo atrito. Pode demorar mais quando percebe alto risco ou mudança brusca.",
    strengths: ["constância", "escuta", "cooperação", "paciência"],
    values: ["segurança", "harmonia", "respeito", "rotina útil", "previsibilidade"],
    d: {
      description:
        "No fator Dominância, tende a expressar firmeza de modo mais seletivo. Quando necessário, pode sustentar posição com serenidade, sem buscar confronto como primeira opção.",
      manifestations: [
        "Prefere influenciar sem agressividade.",
        "Evita imposição direta quando há alternativas colaborativas.",
        "Pode demorar a confrontar, mas sustenta a posição quando decide.",
        "Busca preservar relação mesmo sob divergência.",
      ],
      strengths: ["firmeza tranquila", "equilíbrio"],
      attention: ["adiar confronto necessário", "ceder demais"],
      boost:
        "Fortaleça o fator D treinando posicionamento mais explícito em momentos-chave. Clareza assertiva, sem perder respeito, reduz acúmulo de tensão e aumenta influência real.",
    },
    i: {
      description:
        "No fator Influência, tende a construir conexão por confiabilidade e acolhimento, mais do que por intensidade social ou necessidade de protagonismo.",
      manifestations: [
        "Cultiva relações estáveis e de confiança.",
        "Prefere interações genuínas a exposição intensa.",
        "Contribui para clima seguro e colaborativo.",
        "Comunica-se melhor em contextos respeitosos e previsíveis.",
      ],
      strengths: ["proximidade", "cuidado", "presença confiável"],
      attention: ["baixa visibilidade", "reserva excessiva"],
      boost:
        "Potencialize o fator I dando mais visibilidade ao que já faz bem. Tornar contribuições mais explícitas aumenta reconhecimento sem exigir perda de autenticidade.",
    },
    s: {
      description:
        "A Estabilidade elevada indica constância, paciência e preferência por ritmo previsível. A pessoa tende a sustentar entregas com confiabilidade e baixo ruído relacional.",
      manifestations: [
        "Mantém consistência mesmo em rotinas longas.",
        "Valoriza preparo, sequência e continuidade.",
        "Age com paciência e escuta antes de responder.",
        "Costuma apoiar o grupo de modo silencioso, porém sólido.",
      ],
      strengths: ["regularidade", "cooperação", "lealdade"],
      attention: ["resistência a rupturas", "dificuldade em acelerar"],
      boost:
        "O fator S ganha potência quando a constância é combinada com adaptação gradual. Criar pequenos ciclos de mudança controlada amplia flexibilidade sem perder estabilidade.",
    },
    c: {
      description:
        "No fator Conformidade, tende a respeitar processo, padrão e qualidade quando eles ajudam a preservar segurança, previsibilidade e bom funcionamento coletivo.",
      manifestations: [
        "Segue acordos com disciplina.",
        "Evita improviso excessivo em tarefas críticas.",
        "Prefere clareza a ambiguidade operacional.",
      ],
      strengths: ["organização", "consistência operacional"],
      attention: ["excesso de cautela"],
    },
  },
  C: {
    title: "Analítico",
    summary:
      "Perfil cuidadoso, lógico e orientado a qualidade. Tende a atuar melhor quando há clareza, precisão, critério e espaço para analisar com profundidade antes de decidir.",
    communication:
      "Comunicação criteriosa, técnica e orientada a conteúdo. Costuma valorizar clareza, coerência e precisão acima de improviso.",
    leadership:
      "Lidera por excelência, método e consistência técnica. Eleva padrão do trabalho por análise, estrutura e atenção ao detalhe.",
    decision:
      "Decide com base em evidência, comparação e critério. Prefere reduzir erro antes de avançar e tende a revisar mais antes de concluir.",
    strengths: ["análise", "qualidade", "rigor", "planejamento"],
    values: ["precisão", "lógica", "qualidade", "segurança", "processo"],
    d: {
      description:
        "No fator Dominância, tende a se posicionar com firmeza principalmente quando há incoerência, erro crítico ou necessidade de proteger padrão técnico.",
      manifestations: [
        "Confronta quando identifica falha relevante.",
        "Sustenta posição com base em lógica e evidência.",
        "Evita confronto emocional, mas pode ser duro na crítica técnica.",
        "Prefere autoridade fundamentada a imposição vazia.",
      ],
      strengths: ["firmeza técnica", "segurança argumentativa"],
      attention: ["criticismo excessivo", "rigidez"],
      boost:
        "Fortaleça o fator D convertendo análise em decisão mais ágil. Definir limite de revisão e critérios de suficiência evita paralisia por excesso de detalhamento.",
    },
    i: {
      description:
        "No fator Influência, tende a persuadir pela consistência da lógica, não pelo entusiasmo. A confiança nasce mais da qualidade do raciocínio do que da intensidade social.",
      manifestations: [
        "Explica com profundidade e estrutura.",
        "Constrói credibilidade por coerência.",
        "Pode parecer reservado em ambientes muito expansivos.",
        "Prefere conteúdo sólido a apelo superficial.",
      ],
      strengths: ["credibilidade", "clareza técnica", "argumentação"],
      attention: ["baixa expressividade", "excesso de formalidade"],
      boost:
        "Potencialize o fator I traduzindo análise em linguagem mais acessível. Quando o conteúdo técnico fica mais claro para o outro, a influência cresce sem perder profundidade.",
    },
    s: {
      description:
        "No fator Estabilidade, tende a manter constância por método, organização e previsibilidade. Costuma preferir ambientes controlados, com variação menor e menor improviso.",
      manifestations: [
        "Sustenta rotina com disciplina.",
        "Prefere estabilidade operacional.",
        "Tolera melhor processos claros do que cenários caóticos.",
      ],
      strengths: ["disciplina", "regularidade"],
      attention: ["baixa flexibilidade em ruptura"],
    },
    c: {
      description:
        "A Conformidade elevada indica atenção a padrão, detalhe, lógica e qualidade. A pessoa tende a revisar, comparar e buscar precisão antes de consolidar respostas ou decisões.",
      manifestations: [
        "Analisa antes de concluir.",
        "Busca coerência, estrutura e critério.",
        "Valoriza padrão elevado de qualidade.",
        "Reduz improviso em tarefas críticas.",
      ],
      strengths: ["precisão", "organização", "excelência"],
      attention: ["perfeccionismo", "demora para fechar"],
      boost:
        "O fator C se torna ainda mais útil quando a busca por qualidade é combinada com pragmatismo. Definir nível adequado de profundidade evita excesso de revisão e acelera entrega.",
    },
  },
};

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function pickInitial(name) {
  const clean = safeString(name, "Perfil");
  return clean.charAt(0).toUpperCase();
}

function shortName(name) {
  return safeString(name, "Perfil").split(/\s+/)[0];
}

function buildDocumentCode(name, profileCode) {
  const seed = `${safeString(name, "perfil")}-${profileCode}-${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `SYN-${profileCode}-${String(hash).slice(0, 8).padStart(8, "0")}`;
}

function factorScores(input = {}) {
  return {
    D: clamp(input.D ?? input.d ?? input.scoreD ?? input.score_d ?? 25),
    I: clamp(input.I ?? input.i ?? input.scoreI ?? input.score_i ?? 25),
    S: clamp(input.S ?? input.s ?? input.scoreS ?? input.score_s ?? 25),
    C: clamp(input.C ?? input.c ?? input.scoreC ?? input.score_c ?? 25),
  };
}

function orderedFactors(scores) {
  return Object.entries(scores).sort((a, b) => b[1] - a[1]);
}

function dominantFactor(scores) {
  return orderedFactors(scores)[0][0];
}

function secondaryFactor(scores) {
  return orderedFactors(scores)[1][0];
}

function weakestFactor(scores) {
  return orderedFactors(scores)[3][0];
}

function buildProfileCode(scores) {
  const ordered = orderedFactors(scores);
  return `${ordered[0][0]}${ordered[1][0]}`;
}

function noteForFactor(factor, value) {
  const name = FACTOR_NAMES[factor];
  if (value >= 75) return `${name} muito elevada, com forte presença no comportamento observado.`;
  if (value >= 60) return `${name} elevada, aparecendo com frequência e impacto consistente.`;
  if (value >= 45) return `${name} moderada, com expressão situacional equilibrada.`;
  if (value >= 30) return `${name} mais contida, aparecendo quando o contexto exige.`;
  return `${name} baixa, com menor espontaneidade natural no repertório atual.`;
}

function radarPositionTop(score) {
  return 140 - score;
}

function radarPositionRight(score) {
  return 140 + score;
}

function radarPositionBottom(score) {
  return 140 + score;
}

function radarPositionLeft(score) {
  return 140 - score;
}

function radarLabelTop(score) {
  return Math.max(18, radarPositionTop(score) - 10);
}

function radarLabelRight(score) {
  return Math.min(255, radarPositionRight(score) + 8);
}

function radarLabelBottom(score) {
  return Math.min(262, radarPositionBottom(score) + 14);
}

function radarLabelLeft(score) {
  return Math.max(18, radarPositionLeft(score) - 8);
}

function buildMapCoordinates(scores) {
  const extroversion = scores.I - scores.C;
  const pace = scores.D - scores.S;
  const x = clamp(130 + extroversion * 1.1, 22, 238);
  const y = clamp(130 - pace * 1.1, 22, 238);
  return {
    x,
    y,
    labelY: y - 16 < 12 ? y + 22 : y - 16,
  };
}

function trendSeries(currentScore, factor) {
  const templates = {
    D: [-12, -6, -3, -1, 0],
    I: [-10, -4, -2, 1, 0],
    S: [8, 5, 2, 1, 0],
    C: [10, 6, 3, 1, 0],
  };
  const offsets = templates[factor] || [0, 0, 0, 0, 0];
  return offsets.map((offset) => clamp(currentScore + offset));
}

function trendY(score) {
  return 180 - Math.round((score / 100) * 170);
}

function trendInsight(scores, dominant, secondary, weakest) {
  return `A leitura histórica sugere manutenção de ${FACTOR_NAMES[dominant]} como eixo principal, com ${FACTOR_NAMES[secondary]} funcionando como apoio recorrente. ${FACTOR_NAMES[weakest]} aparece como dimensão menos espontânea e, por isso, representa a melhor oportunidade de desenvolvimento consciente.`;
}

function developmentStrategy(profileCode, dominant, weakest) {
  return `Para o perfil ${profileCode}, a estratégia mais eficiente é preservar a força central de ${FACTOR_NAMES[dominant]} sem permitir exagero do traço, enquanto ${FACTOR_NAMES[weakest]} é desenvolvido de forma prática, incremental e observável em situações reais de trabalho e relacionamento.`;
}

function integratedReading(name, profileCode, dominant, secondary) {
  return `${safeString(name, "O perfil")} apresenta configuração ${profileCode}, com predominância de ${FACTOR_NAMES[dominant]} e apoio relevante de ${FACTOR_NAMES[secondary]}. O conjunto dos gráficos aponta para um estilo que tende a responder melhor quando o ambiente respeita seu padrão natural de energia, decisão e interação.`;
}

function summaryText(name, profileData, profileCode, dominant, secondary) {
  return `${safeString(name, "Este perfil")} demonstra um padrão ${profileCode}, com ${FACTOR_NAMES[dominant]} como fator dominante e ${FACTOR_NAMES[secondary]} como apoio principal. ${profileData.summary}`;
}

function communicationTips(dominant) {
  const tips = {
    D: [
      "Seja direto, claro e objetivo ao comunicar.",
      "Apresente opções com impacto, prazo e ganho esperado.",
      "Evite excesso de rodeios antes do ponto principal.",
      "Dê autonomia junto com responsabilidade explícita.",
    ],
    I: [
      "Use tom relacional, leve e engajador.",
      "Mostre visão, reconhecimento e oportunidade de participação.",
      "Prefira mensagens vivas a excesso de formalismo.",
      "Confirme combinados por escrito para sustentar execução.",
    ],
    S: [
      "Comunique com calma, clareza e respeito ao ritmo.",
      "Explique mudanças com antecedência e contexto.",
      "Evite pressão desnecessária e rupturas bruscas.",
      "Demonstre previsibilidade e consistência no trato.",
    ],
    C: [
      "Seja preciso, organizado e lógico na exposição.",
      "Traga critérios, dados e expectativa de qualidade.",
      "Evite ambiguidade e mudanças mal definidas.",
      "Dê espaço para análise antes de fechar decisões críticas.",
    ],
  };
  return tips[dominant];
}

function contextualBehavior(dominant, weakest) {
  return {
    pressure: `Sob pressão, tende a intensificar ${FACTOR_NAMES[dominant]}, buscando resolver a situação pelo repertório mais espontâneo. Quando isso ocorre sem compensação, ${FACTOR_NAMES[weakest]} pode ficar subutilizado.`,
    conflict: `Em conflito, reage conforme o eixo dominante do perfil: pode confrontar, persuadir, acomodar ou analisar mais antes de responder. O ponto crítico é evitar leitura rígida da situação.`,
    team: `Em equipe, costuma contribuir mais quando ocupa papéis coerentes com suas forças naturais e quando o ambiente reconhece seu modo de operar.`,
    alone: `Em atuação individual, tende a expressar seu repertório central com mais consistência, sem tanta interferência de adaptação social.`,
  };
}

function risksText(dominant, weakest) {
  return {
    aTitle: "Exagero do fator dominante",
    aDesc: `Quando ${FACTOR_NAMES[dominant]} sobe sem compensação, o principal risco é perder flexibilidade e gerar efeito colateral relacional ou operacional.`,
    bTitle: "Subuso do fator menos natural",
    bDesc: `A baixa expressão de ${FACTOR_NAMES[weakest]} pode reduzir eficácia justamente em contextos que exigem esse repertório.`,
    cTitle: "Leitura rígida do próprio perfil",
    cDesc: "Transformar o perfil em rótulo reduz crescimento. O objetivo é ampliar repertório, não cristalizar identidade.",
  };
}

function conclusionText(name, profileCode, scores, dominant, secondary, weakest) {
  const ordered = orderedFactors(scores)
    .map(([factor, value]) => `${factor} ${value}%`)
    .join(" · ");
  return `${safeString(name, "O perfil avaliado")} apresenta configuração ${profileCode}, com predominância de ${FACTOR_NAMES[dominant]} e apoio de ${FACTOR_NAMES[secondary]}. A distribuição ${ordered} sugere um estilo com potencial elevado quando o contexto permite expressão natural do eixo dominante, ao mesmo tempo em que exige desenvolvimento consciente de ${FACTOR_NAMES[weakest]} para ampliar adaptabilidade, reduzir ponto cego e sustentar performance de forma mais madura.`;
}

function buildDiscReportData(input = {}) {
  const name = safeString(input.name ?? input.clientName ?? input.nome, "Perfil avaliado");
  const context = safeString(
    input.role ?? input.context ?? input.cargo ?? input.cargoOuContexto,
    "Contexto profissional não informado"
  );
  const mode = safeString(input.mode ?? input.modo ?? "DISC Premium");
  const generatedAt = safeString(input.generatedAt ?? input.dataGeracao, new Date().toLocaleDateString("pt-BR"));

  const scores = factorScores(input.scores ?? input);
  const dominant = dominantFactor(scores);
  const secondary = secondaryFactor(scores);
  const weakest = weakestFactor(scores);
  const profileCode = buildProfileCode(scores);
  const dominantLibrary = PROFILE_LIBRARY[dominant];

  const radar = {
    dY: radarPositionTop(scores.D),
    iX: radarPositionRight(scores.I),
    sY: radarPositionBottom(scores.S),
    cX: radarPositionLeft(scores.C),
    dLabelY: radarLabelTop(scores.D),
    iLabelX: radarLabelRight(scores.I),
    sLabelY: radarLabelBottom(scores.S),
    cLabelX: radarLabelLeft(scores.C),
  };

  const map = buildMapCoordinates(scores);
  const periods = ["T-4", "T-3", "T-2", "T-1", "Atual"];
  const trendD = trendSeries(scores.D, "D");
  const trendI = trendSeries(scores.I, "I");
  const trendS = trendSeries(scores.S, "S");
  const trendC = trendSeries(scores.C, "C");
  const tips = communicationTips(dominant);
  const behavior = contextualBehavior(dominant, weakest);
  const risks = risksText(dominant, weakest);

  return {
    TITULO_RELATORIO: `Relatório DISC Individual — ${name}`,
    SUBTITULO_RELATORIO:
      "Leitura comportamental premium com foco em perfil predominante, padrões de resposta, aplicações práticas e desenvolvimento estratégico.",
    INICIAL_NOME: pickInitial(name),
    CLIENTE_NOME: name,
    CLIENTE_NOME_CURTO: shortName(name),
    CARGO_OU_CONTEXTO: context,
    SCORE_D: scores.D,
    SCORE_I: scores.I,
    SCORE_S: scores.S,
    SCORE_C: scores.C,
    PERFIL_DOMINANTE: `${dominant} — ${dominantLibrary.title}`,
    MODO_ATIVO: mode,
    DATA_GERACAO: generatedAt,
    CODIGO_DOCUMENTO: buildDocumentCode(name, profileCode),

    NOTA_D: noteForFactor("D", scores.D),
    NOTA_I: noteForFactor("I", scores.I),
    NOTA_S: noteForFactor("S", scores.S),
    NOTA_C: noteForFactor("C", scores.C),

    RESUMO_PERFIL: summaryText(name, dominantLibrary, profileCode, dominant, secondary),
    TRAIT_1: dominantLibrary.strengths[0],
    TRAIT_2: dominantLibrary.strengths[1],
    TRAIT_3: dominantLibrary.strengths[2],
    TRAIT_4: dominantLibrary.strengths[3],
    TRAIT_5: dominantLibrary.values[0],
    TRAIT_6: dominantLibrary.values[1],

    RADAR_D_Y: radar.dY,
    RADAR_I_X: radar.iX,
    RADAR_S_Y: radar.sY,
    RADAR_C_X: radar.cX,
    RADAR_D_LABEL_Y: radar.dLabelY,
    RADAR_I_LABEL_X: radar.iLabelX,
    RADAR_S_LABEL_Y: radar.sLabelY,
    RADAR_C_LABEL_X: radar.cLabelX,

    MAPA_X: map.x,
    MAPA_Y: map.y,
    MAPA_LABEL_Y: map.labelY,
    LEITURA_INTEGRADA: integratedReading(name, profileCode, dominant, secondary),

    PERIODO_1: periods[0],
    PERIODO_2: periods[1],
    PERIODO_3: periods[2],
    PERIODO_4: periods[3],
    PERIODO_5: periods[4],

    TREND_D1_Y: trendY(trendD[0]),
    TREND_D2_Y: trendY(trendD[1]),
    TREND_D3_Y: trendY(trendD[2]),
    TREND_D4_Y: trendY(trendD[3]),
    TREND_D5_Y: trendY(trendD[4]),
    TREND_I1_Y: trendY(trendI[0]),
    TREND_I2_Y: trendY(trendI[1]),
    TREND_I3_Y: trendY(trendI[2]),
    TREND_I4_Y: trendY(trendI[3]),
    TREND_I5_Y: trendY(trendI[4]),
    TREND_S1_Y: trendY(trendS[0]),
    TREND_S2_Y: trendY(trendS[1]),
    TREND_S3_Y: trendY(trendS[2]),
    TREND_S4_Y: trendY(trendS[3]),
    TREND_S5_Y: trendY(trendS[4]),
    TREND_C1_Y: trendY(trendC[0]),
    TREND_C2_Y: trendY(trendC[1]),
    TREND_C3_Y: trendY(trendC[2]),
    TREND_C4_Y: trendY(trendC[3]),
    TREND_C5_Y: trendY(trendC[4]),

    TENDENCIA_OBSERVADA: trendInsight(scores, dominant, secondary, weakest),
    VARIACAO_1: `${FACTOR_NAMES[dominant]} segue como eixo mais consistente da leitura histórica.`,
    VARIACAO_2: `${FACTOR_NAMES[secondary]} aparece como suporte relevante na adaptação do estilo ao contexto.`,
    VARIACAO_3: `${FACTOR_NAMES[weakest]} permanece como melhor frente para desenvolvimento intencional.`,

    DESC_D: dominantLibrary.d.description,
    MANIF_D_1: dominantLibrary.d.manifestations[0],
    MANIF_D_2: dominantLibrary.d.manifestations[1],
    MANIF_D_3: dominantLibrary.d.manifestations[2],
    MANIF_D_4: dominantLibrary.d.manifestations[3],
    FORTE_D_1: dominantLibrary.d.strengths[0],
    FORTE_D_2: dominantLibrary.d.strengths[1],
    FORTE_D_3: dominantLibrary.d.strengths[2],
    ATENCAO_D_1: dominantLibrary.d.attention[0],
    ATENCAO_D_2: dominantLibrary.d.attention[1],
    POTENCIALIZAR_D: dominantLibrary.d.boost,

    DESC_I: dominantLibrary.i.description,
    MANIF_I_1: dominantLibrary.i.manifestations[0],
    MANIF_I_2: dominantLibrary.i.manifestations[1],
    MANIF_I_3: dominantLibrary.i.manifestations[2],
    MANIF_I_4: dominantLibrary.i.manifestations[3],
    FORTE_I_1: dominantLibrary.i.strengths[0],
    FORTE_I_2: dominantLibrary.i.strengths[1],
    FORTE_I_3: dominantLibrary.i.strengths[2],
    ATENCAO_I_1: dominantLibrary.i.attention[0],
    ATENCAO_I_2: dominantLibrary.i.attention[1],
    POTENCIALIZAR_I: dominantLibrary.i.boost,

    DESC_S: dominantLibrary.s.description,
    MANIF_S_1: dominantLibrary.s.manifestations[0],
    MANIF_S_2: dominantLibrary.s.manifestations[1],
    MANIF_S_3: dominantLibrary.s.manifestations[2],
    FORTE_S_1: dominantLibrary.s.strengths[0],
    FORTE_S_2: dominantLibrary.s.strengths[1],
    ATENCAO_S_1: dominantLibrary.s.attention[0],

    DESC_C: dominantLibrary.c.description,
    MANIF_C_1: dominantLibrary.c.manifestations[0],
    MANIF_C_2: dominantLibrary.c.manifestations[1],
    MANIF_C_3: dominantLibrary.c.manifestations[2],
    FORTE_C_1: dominantLibrary.c.strengths[0],
    FORTE_C_2: dominantLibrary.c.strengths[1],
    ATENCAO_C_1: dominantLibrary.c.attention[0],

    ESTILO_COMUNICACAO: dominantLibrary.communication,
    ESTILO_LIDERANCA: dominantLibrary.leadership,
    TOMADA_DECISAO: dominantLibrary.decision,
    COMO_COMUNICAR_1: tips[0],
    COMO_COMUNICAR_2: tips[1],
    COMO_COMUNICAR_3: tips[2],
    COMO_COMUNICAR_4: tips[3],
    VALOR_1: dominantLibrary.values[0],
    VALOR_2: dominantLibrary.values[1],
    VALOR_3: dominantLibrary.values[2],
    VALOR_4: dominantLibrary.values[3],
    VALOR_5: dominantLibrary.values[4],
    COMPORTAMENTO_PRESSAO: behavior.pressure,
    COMPORTAMENTO_CONFLITO: behavior.conflict,
    COMPORTAMENTO_TIME: behavior.team,
    COMPORTAMENTO_SOZINHO: behavior.alone,

    ESTRATEGIA_DESENVOLVIMENTO: developmentStrategy(profileCode, dominant, weakest),
    ETAPA_1_TITULO: "Consolidar forças naturais",
    ETAPA_1_DESCRICAO: `Usar ${FACTOR_NAMES[dominant]} como vantagem competitiva consciente, aumentando previsibilidade de performance sem exagerar o traço.`,
    ETAPA_2_TITULO: "Reduzir excessos comportamentais",
    ETAPA_2_DESCRICAO: `Identificar situações em que o fator dominante passa do ponto e começa a gerar ruído, atrito ou perda de eficácia.`,
    ETAPA_3_TITULO: "Desenvolver fator menos espontâneo",
    ETAPA_3_DESCRICAO: `Fortalecer ${FACTOR_NAMES[weakest]} de forma intencional para ampliar repertório e reduzir ponto cego.`,

    KPI_A_NOME: "Autoconsciência",
    KPI_A_DESC: "Percepção clara do padrão natural de resposta.",
    KPI_B_NOME: "Adaptação",
    KPI_B_DESC: "Capacidade de modular o estilo conforme o contexto.",
    KPI_C_NOME: "Consistência",
    KPI_C_DESC: "Manutenção de performance sem oscilação excessiva.",
    KPI_D_NOME: "Relacionamento",
    KPI_D_DESC: "Qualidade da interação com perfis distintos.",

    RISCO_A_TITULO: risks.aTitle,
    RISCO_A_DESC: risks.aDesc,
    RISCO_B_TITULO: risks.bTitle,
    RISCO_B_DESC: risks.bDesc,
    RISCO_C_TITULO: risks.cTitle,
    RISCO_C_DESC: risks.cDesc,

    EVITAR_1: "Interpretar o perfil como limite fixo.",
    EVITAR_2: "Usar a força dominante sem consciência do efeito nos outros.",
    EVITAR_3: "Negligenciar o desenvolvimento do fator menos espontâneo.",

    PROXIMO_PASSO: `A prioridade mais inteligente agora é transformar a leitura do perfil ${profileCode} em um plano objetivo de desenvolvimento, começando por situações reais em que ${FACTOR_NAMES[dominant]} já gera resultado e em que ${FACTOR_NAMES[weakest]} ainda precisa ser conscientemente ativado.`,
    CONCLUSAO_EXECUTIVA: conclusionText(name, profileCode, scores, dominant, secondary, weakest),
  };
}

function replaceAll(template, data) {
  let output = String(template ?? "");
  for (const [key, value] of Object.entries(data || {})) {
    output = output.split(`{{${key}}}`).join(String(value ?? ""));
  }
  return output.replace(/\{\{[A-Z0-9_]+\}\}/g, "");
}

module.exports = {
  buildDiscReportData,
  replaceAll,
};