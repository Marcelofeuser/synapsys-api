const fs = require("fs");
const path = require("path");

const PROMPT_ROOTS = [
  // repo root (ex: /SynapsysAI)
  path.resolve(__dirname, "../../.."),
  // backend root (ex: /SynapsysAI/backend)
  path.resolve(__dirname, "../.."),
];

function resolvePromptPath(relativePath) {
  for (const root of PROMPT_ROOTS) {
    const candidate = path.join(root, relativePath);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function readPrompt(relativePath, { optional = false } = {}) {
  const fullPath = resolvePromptPath(relativePath);

  if (!fullPath) {
    if (optional) return "";

    const attempted = PROMPT_ROOTS.map((root) => path.join(root, relativePath)).join(" | ");
    throw new Error(`Prompt não encontrado: ${relativePath}. Tentativas: ${attempted}`);
  }

  return fs.readFileSync(fullPath, "utf-8").trim();
}

function loadAllPrompts() {
  const systemPrompt = readPrompt("prompts/system-prompt.md");
  const expertRules =
    readPrompt("prompts/expert-rules.md", { optional: true }) ||
    readPrompt("prompts/expert-rules.mdz", { optional: true });

  const saasContext = readPrompt("prompts/saas-context.md", { optional: true });
  const specialization = readPrompt("prompts/specialization-context.md", { optional: true });

  return [systemPrompt, expertRules, saasContext, specialization].filter(Boolean).join("\n\n");
}

function loadModePrompt(mode = "builder") {
  const normalizedMode = String(mode || "builder").toLowerCase();

  const modePrompts = {
    builder: [
      "Modo ativo: Builder.",
      "Foque em implementar funcionalidades completas com código de produção.",
      "Explique de forma prática, orientando estrutura, arquivos, lógica e testes.",
    ].join(" "),
    debugger: [
      "Modo ativo: Debugger.",
      "Foque em diagnóstico, causa raiz, correção segura e prevenção de regressão.",
      "Priorize análise antes de propor código.",
    ].join(" "),
    architect: [
      "Modo ativo: Architect.",
      "Foque em arquitetura SaaS, multi-tenancy, autenticação, permissões, billing, escalabilidade e organização sistêmica.",
      "Priorize desenho técnico e impacto estrutural.",
    ].join(" "),
  };

  return modePrompts[normalizedMode] || modePrompts.builder;
}

// ─── Agentes alternativos (17/09/2026) ───
// Até aqui só existia UM persona (a engenheira de software do
// system-prompt.md) com "modo" mudando só o foco dela. O Copiloto SevenGo
// é uma persona DIFERENTE de verdade — consultoria/operação, não
// engenharia de software — então não é aditivo como os modePrompts acima
// (não faz sentido "somar" a persona de engenharia com a de consultoria).
// loadAgentPrompt retorna null pro agente padrão (quem chama já sabe usar
// loadAllPrompts + loadModePrompt nesse caso) e o prompt completo,
// próprio, quando é um agente alternativo — substituindo tudo o resto.
function loadAgentPrompt(agent) {
  const normalizedAgent = String(agent || "synapsys").toLowerCase();

  if (normalizedAgent === "sevengo") {
    return readPrompt("prompts/agents/sevengo-copiloto.md");
  }

  return null;
}

module.exports = {
  loadAllPrompts,
  loadModePrompt,
  loadAgentPrompt,
};
