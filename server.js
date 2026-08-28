const { renderDiscReport } = require("./src/disc/renderDiscReport");
const { loadDiscBase } = require("./src/knowledge/loadDiscBase");
const cors = require("cors");
const OpenAI = require("openai");
const { loadAllPrompts, loadModePrompt } = require("./src/ai/loadPrompts");
const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const BASE_DOMAIN = process.env.BASE_DOMAIN || "insightdisc.com";
const SYNAPSYS_SUBDOMAIN = process.env.SYNAPSYS_SUBDOMAIN || "synapsys";
const SYNAPSYS_PROTOCOL = process.env.SYNAPSYS_PROTOCOL || "https";

const SYNAPSYS_DOMAIN = `${SYNAPSYS_SUBDOMAIN}.${BASE_DOMAIN}`;
const SYNAPSYS_URL = `${SYNAPSYS_PROTOCOL}://${SYNAPSYS_DOMAIN}`;

// URL real do frontend em produção (synapsysai.com.br) — SYNAPSYS_URL acima
// aponta pro domínio antigo (synapsys.insightdisc.com) por causa do
// fallback de BASE_DOMAIN/SYNAPSYS_SUBDOMAIN, que nunca foi atualizado
// depois da migração de domínio. Não mexi nisso (fora do escopo desta
// mudança), só criei uma constante própria e correta pros redirects do
// Stripe não voltarem pro domínio errado.
const FRONTEND_URL = process.env.FRONTEND_URL || "https://synapsysai.com.br";

const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");
const {
  addConversationMessage,
  createConversation,
  createProject,
  deleteConversation,
  deleteProject,
  getConversation,
  isMissingSynapsysTableError,
  listConversations,
  listProjects,
  listRecentConversations,
  searchWorkspace,
  updateConversation,
  updateProject,
} = require("./src/synapsys/repository");
const {
  getOrCreateAccess,
  resetUsageIfDue,
  incrementUsage,
  isBlockedByLimit,
  isMissingAccessTableError,
  usageSummary,
  resolveModelKey,
  MODEL_LABELS,
} = require("./src/synapsys/access");
const {
  createCheckoutSession,
  changeSubscriptionPlan,
  createPortalSession,
  handleWebhookEvent,
  getStripe,
  isValidTier,
  isValidCycle,
} = require("./src/synapsys/billing");
const { listUsersWithAccess, upsertUserAccess } = require("./src/synapsys/adminUsers");
const { renderAdminPage } = require("./src/synapsys/adminPage");
const { classifyModelKey } = require("./src/synapsys/autoRoute");
const {
  buildConversationTitle,
  getRangeStart,
  normalizeConversationFilter,
  toPositiveInteger,
} = require("./src/synapsys/utils");

// FIX: no Railway só existiam VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY
// (usadas pelo frontend). O backend só lia SUPABASE_URL/SUPABASE_ANON_KEY,
// então o cliente ficava sempre null e requireUser caía direto no fallback
// "dev-user" — ou seja, nenhuma requisição era autenticada de verdade.
// Aceitamos os dois nomes agora, com preferência pelas variáveis sem prefixo.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Cliente com a service_role key — ignora RLS. USO RESTRITO ao webhook do
// Stripe: como o Stripe chama o backend direto (sem JWT de usuário), o
// cliente por-requisição normal (anon key + JWT) não serve aqui — as
// policies de synapsys_access só liberam auth.uid() = user_id, e no
// webhook não existe auth.uid() nenhum. Sem SUPABASE_SERVICE_ROLE_KEY
// configurada, o webhook simplesmente não consegue gravar (fica só
// logando o erro) — configure em Settings > API > service_role no
// Supabase, e cole em Railway como SUPABASE_SERVICE_ROLE_KEY.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseService =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

// Cliente por-requisição, autenticado com o JWT do próprio usuário — é o
// que faz as políticas de RLS (auth.uid() = user_id) funcionarem
// corretamente, isolando os dados de cada usuário.
function createRequestSupabaseClient(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function requireUser(req, res, next) {
  if (!supabase) {
    req.user = { id: "dev-user" };
    req.db = null;
    return next();
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Token não enviado" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  req.user = user;
  req.accessToken = token;
  req.db = createRequestSupabaseClient(token);
  next();
}

function getWorkspaceFilter(req) {
  const filter = normalizeConversationFilter(req.query.filter || req.query.period || "30d");
  return {
    filter,
    rangeStart: getRangeStart(filter),
    projectId: String(req.query.projectId || "").trim() || null,
  };
}

function handleWorkspaceError(res, error, fallbackMessage) {
  console.error("[synapsys-workspace]", error.message);

  if (isMissingSynapsysTableError(error)) {
    return res.status(503).json({
      error: "As tabelas da Synapsys ainda não foram criadas no banco.",
      setupRequired: true,
    });
  }

  return res.status(error.statusCode || 500).json({
    error: fallbackMessage,
    details: error.message,
  });
}

const app = express();

// ─── Webhook do Stripe — TEM que vir antes do express.json() global ───
// O Stripe assina o corpo cru (bytes exatos) da requisição; se o
// express.json() já tiver parseado/reserializado o body antes de chegar
// aqui, a verificação de assinatura sempre falha. Por isso essa rota usa
// seu próprio express.raw() e é registrada antes do app.use(express.json())
// abaixo — rotas registradas antes "vencem" a rota da requisição e nunca
// passam pelo parser global.
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET ausente — webhook não processado.");
    return res.status(500).send("Stripe não configurado no servidor.");
  }

  let event;
  try {
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Assinatura inválida:", err.message);
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  if (!supabaseService) {
    console.error("[stripe-webhook] SUPABASE_SERVICE_ROLE_KEY ausente — evento recebido mas não gravado:", event.type);
    // Responde 200 mesmo assim: um 4xx/5xx faria o Stripe reenviar o mesmo
    // evento repetidamente, e o problema aqui é de configuração, não algo
    // que uma nova tentativa resolveria.
    return res.status(200).json({ received: true, warning: "not-persisted-missing-service-role-key" });
  }

  try {
    const result = await handleWebhookEvent(supabaseService, event);
    console.log(`[stripe-webhook] ${event.type} →`, result);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[stripe-webhook] Falha ao processar ${event.type}:`, err.message);
    // 500 aqui É proposital: isso faz o Stripe tentar reenviar o evento
    // mais tarde (diferente do caso acima, isso é uma falha transitória —
    // ex.: Supabase fora do ar — que uma nova tentativa pode resolver).
    return res.status(500).json({ error: "Falha ao processar evento." });
  }
});

app.use(express.json({ limit: "15mb" }));

// CORS dinâmico: se CORS_ORIGINS="*" libera qualquer origem; senão usa a lista fixa + o que vier na env
const _corsEnv = (process.env.CORS_ORIGINS || "").trim();
const _staticOrigins = [
  "http://localhost:5176",
  "http://localhost:5174",
  "http://localhost:5173",
  "https://synapsys-ai.vercel.app",
  "https://app.insightdisc.com",
  "https://synapsys-frontend-production.up.railway.app",
  "https://www.synapsysai.com.br",
  "https://synapsysai.com.br"
];
const _extraOrigins =
  _corsEnv && _corsEnv !== "*"
    ? _corsEnv.split(",").map((o) => o.trim()).filter(Boolean)
    : [];
app.use(
  cors({
    origin: _corsEnv === "*" ? true : [..._staticOrigins, ..._extraOrigins],
    credentials: true,
  })
);

// --- Providers ---
// FIX: instanciar providers apenas se a chave existir,
// evitando crash na inicialização do servidor

let openai = null;
let groq = null;
let anthropic = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.warn("⚠️ OPENAI_API_KEY não configurada — Sol, Terra e Luna (todos GPT-5.6/OpenAI) ficam desativados");
}

// Groq e Claude não são mais usados no roteamento Sol/Terra/Luna (ver
// providerForModelKey mais abaixo — os três modelos são GPT-5.6 da
// própria OpenAI). Os clientes seguem instanciados aqui só como reserva,
// caso algum fluxo futuro volte a precisar de outro provider; nenhuma
// GROQ_API_KEY/ANTHROPIC_API_KEY é necessária hoje em produção.
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

let discBase = {};

try {
  discBase = loadDiscBase();
  console.log("✅ Base DISC carregada com sucesso");
} catch (error) {
  console.warn("⚠️ Falha ao carregar base DISC:", error.message);
}

async function openaiProvider(systemPrompt, userInput, images = [], history = [], modelKey = "terra") {
  if (!openai) {
    throw new Error("OpenAI não configurada: OPENAI_API_KEY ausente nas variáveis de ambiente");
  }

  const userContent = images.length
    ? [
        { type: "text", text: userInput },
        ...images.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
      ]
    : userInput;

  const response = await openai.chat.completions.create({
    model: resolveOpenAIModel(modelKey, images.length > 0),
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userContent },
    ],
  });

  return response.choices?.[0]?.message?.content || "";
}

async function groqProvider(systemPrompt, userInput, history = []) {
  if (!groq) {
    throw new Error("Groq não configurado: GROQ_API_KEY ausente nas variáveis de ambiente");
  }

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userInput },
    ],
  });

  return completion.choices?.[0]?.message?.content || "";
}

async function claudeProvider(systemPrompt, userInput, images = [], history = []) {
  if (!anthropic) {
    throw new Error("Claude não configurado: ANTHROPIC_API_KEY ausente nas variáveis de ambiente");
  }

  const userContent = images.length
    ? [
        ...images.map((img) => ({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.base64 },
        })),
        { type: "text", text: userInput },
      ]
    : userInput;

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [...history, { role: "user", content: userContent }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "";
}

// ─── Versões com streaming (token a token) dos mesmos três providers ───
// onDelta(text) é chamado a cada pedaço de texto recebido do provider.
async function openaiProviderStream(systemPrompt, userInput, images, onDelta, abortSignal, history = [], modelKey = "terra") {
  if (!openai) {
    throw new Error("OpenAI não configurada: OPENAI_API_KEY ausente nas variáveis de ambiente");
  }

  const userContent = images.length
    ? [
        { type: "text", text: userInput },
        ...images.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
      ]
    : userInput;

  const stream = await openai.chat.completions.create(
    {
      model: resolveOpenAIModel(modelKey, images.length > 0),
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userContent },
      ],
      stream: true,
    },
    { signal: abortSignal }
  );

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) onDelta(delta);
  }
}

async function groqProviderStream(systemPrompt, userInput, onDelta, abortSignal, history = []) {
  if (!groq) {
    throw new Error("Groq não configurado: GROQ_API_KEY ausente nas variáveis de ambiente");
  }

  const stream = await groq.chat.completions.create(
    {
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userInput },
      ],
      stream: true,
    },
    { signal: abortSignal }
  );

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) onDelta(delta);
  }
}

async function claudeProviderStream(systemPrompt, userInput, images, onDelta, abortSignal, history = []) {
  if (!anthropic) {
    throw new Error("Claude não configurado: ANTHROPIC_API_KEY ausente nas variáveis de ambiente");
  }

  const userContent = images.length
    ? [
        ...images.map((img) => ({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.base64 },
        })),
        { type: "text", text: userInput },
      ]
    : userInput;

  const stream = anthropic.messages.stream(
    {
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [...history, { role: "user", content: userContent }],
    },
    { signal: abortSignal }
  );

  stream.on("text", (text) => onDelta(text));
  await stream.finalMessage();
}

// ─── Roteamento por modelo escolhido (Sol/Terra/Luna) ───
// Correção 21/08/2026: Sol, Terra e Luna NÃO são empresas de IA
// diferentes — são os três modelos da própria linha GPT-5.6 da OpenAI
// (frontier / equilibrado / econômico), com preço por token bem
// diferente entre si (Luna sai ~25x mais barato que Sol). A versão
// anterior deste roteamento tratava cada nome como um provider distinto
// (Sol→OpenAI, Terra→Claude, Luna→Groq), o que exigia ANTHROPIC_API_KEY
// e GROQ_API_KEY — chaves que nunca foram configuradas em produção, então
// todo mundo usando Terra ou Luna (o modelo padrão do app) caía em erro.
// Agora os três usam só a chave da OpenAI, cada um chamando o modelo
// gpt-5.6-* real correspondente (ver OPENAI_MODEL_BY_KEY abaixo) — o que
// também é o que faz a cota por modelo (src/synapsys/access.js) refletir
// custo real: cada modelo tem preço de API diferente de verdade.
const OPENAI_MODEL_BY_KEY = {
  sol: process.env.OPENAI_MODEL_SOL || "gpt-5.6-sol",
  terra: process.env.OPENAI_MODEL_TERRA || "gpt-5.6-terra",
  luna: process.env.OPENAI_MODEL_LUNA || "gpt-5.6-luna",
};

// Os três modelos GPT-5.6 já suportam imagem nativamente — não precisa
// mais trocar de modelo quando vem anexo. OPENAI_VISION_MODEL continua
// disponível como override manual, caso um dia seja necessário forçar
// um modelo específico só pra requisições com imagem.
function resolveOpenAIModel(modelKey, hasImages) {
  if (hasImages && process.env.OPENAI_VISION_MODEL) {
    return process.env.OPENAI_VISION_MODEL;
  }
  return OPENAI_MODEL_BY_KEY[modelKey] || OPENAI_MODEL_BY_KEY.terra;
}

function providerForModelKey(modelKey) {
  if (!["sol", "terra", "luna"].includes(modelKey)) return null;
  return openai ? "openai" : null;
}

// FIX: termos DISC mais precisos — mantidos para uso futuro,
// mas o roteamento principal agora é por AI_PROVIDER
const DISC_TERMS = [
  "DISC",
  "dominân",
  "dominan",
  "influên",
  "estabilidade comportamental",
  "conformidade",
  "perfil comportamental",
  "perfil disc",
  "fator d",
  "fator i",
  "fator s",
  "fator c",
  " DI ",
  " DC ",
  " IS ",
  " SC ",
  " ID ",
  " CD ",
  " SI ",
  " CS ",
];

function isDiscMessage(input) {
  const upper = input.toUpperCase();
  return DISC_TERMS.some((term) => upper.includes(term.toUpperCase()));
}

// FIX: agora usa prompts estruturados + modo operacional
// OpenAI vira provider principal por configuração explícita
function buildSystemPrompt(mode) {
  const FALLBACK_PROMPT =
    "Você é a Synapsys AI, um sistema de inteligência artificial focado em automação, análise e tomada de decisão para empresas. Seja claro, direto e entregue soluções práticas.";

  let basePrompt = FALLBACK_PROMPT;
  try {
    basePrompt = loadAllPrompts();
  } catch (error) {
    console.warn("⚠️ Falha ao carregar prompts estruturados:", error.message);
  }

  let modePrompt = "";
  try {
    modePrompt = loadModePrompt(mode || "builder");
  } catch (error) {
    console.warn("⚠️ Falha ao carregar mode prompt:", error.message);
  }

  return [basePrompt, modePrompt].filter(Boolean).join("\n\n");
}

async function generateInsight(userInput, mode = "builder", images = [], history = [], modelKey = "terra") {
  const systemPrompt = buildSystemPrompt(mode);
  const hasImages = images.length > 0;
  const providerKey = providerForModelKey(modelKey);

  if (!providerKey) {
    throw new Error(
      `Nenhum provider disponível pro modelo "${modelKey}". Verifique OPENAI_API_KEY nas variáveis de ambiente do Railway.`
    );
  }

  const text = await openaiProvider(systemPrompt, userInput, images, history, modelKey);
  return { text, source: hasImages ? "openai-vision" : "openai", modelKey };
}

// ─── Versão com streaming: mesmo roteamento por modelo do generateInsight
// acima, mas emitindo pedaços de texto via onDelta em vez de esperar a
// resposta inteira. Sem fallback silencioso pra outro provider/modelo se o
// escolhido falhar — trocar de modelo no meio mudaria qual cota é
// debitada, o que seria confuso pro usuário. Se falhar, o erro sobe.
async function streamInsight(userInput, mode = "builder", images = [], onDelta, abortSignal, history = [], modelKey = "terra") {
  const systemPrompt = buildSystemPrompt(mode);
  const hasImages = images.length > 0;
  const providerKey = providerForModelKey(modelKey);

  if (!providerKey) {
    throw new Error(
      `Nenhum provider disponível pro modelo "${modelKey}". Verifique OPENAI_API_KEY nas variáveis de ambiente do Railway.`
    );
  }

  await openaiProviderStream(systemPrompt, userInput, images, onDelta, abortSignal, history, modelKey);
  return hasImages ? "openai-vision" : "openai";
}

// ════════════════════════════════════════════════════════
//  STATS — rastreamento em memória
// ════════════════════════════════════════════════════════
const stats = {
  totalRequests: 0,
  totalErrors: 0,
  responseTimes: [],        // últimos 100 tempos de resposta (ms)
  requestsPerDay: {},       // { "2026-04-10": 42 }
  recentLogs: [],           // últimas 50 interações
  startedAt: new Date().toISOString(),
};

function trackRequest({ input, output, source, durationMs, error = false }) {
  stats.totalRequests++;
  if (error) stats.totalErrors++;

  stats.responseTimes.push(durationMs);
  if (stats.responseTimes.length > 100) stats.responseTimes.shift();

  const today = new Date().toISOString().slice(0, 10);
  stats.requestsPerDay[today] = (stats.requestsPerDay[today] || 0) + 1;

  stats.recentLogs.unshift({
    ts: new Date().toISOString(),
    input: (input || "").slice(0, 120),
    output: error ? "[ERRO]" : (output || "").slice(0, 200),
    source,
    durationMs,
    error,
  });
  if (stats.recentLogs.length > 50) stats.recentLogs.pop();
}

// ════════════════════════════════════════════════════════
//  ADMIN AUTH middleware
// ════════════════════════════════════════════════════════
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "synapsys-admin-2026";
const activeSessions = new Set();   // tokens simples em memória

function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: "Não autorizado. Faça login em /superadmin/login" });
  }
  next();
}

// ════════════════════════════════════════════════════════
//  ADMIN CONFIG em memória (sobrescreve temporariamente)
// ════════════════════════════════════════════════════════
const runtimeConfig = {
  aiProvider: null,        // null = usa env AI_PROVIDER
  openaiModel: null,
  groqModel: null,
  claudeModel: null,
  temperature: null,
  systemPromptOverride: null,
};

// ════════════════════════════════════════════════════════
//  ROUTES — público
// ════════════════════════════════════════════════════════

app.get("/", (req, res) => {
  res.json({ message: "Synapsys AI backend online" });
});

// ─── Agente Local — tool calling de verdade (usado pelo CLI que roda no Mac) ───
// Diferente de /synapsys/analyze: aqui NADA é executado no servidor. O backend
// só repassa a conversa + as ferramentas disponíveis pra OpenAI e devolve a
// resposta do modelo (texto OU tool_calls) pro CLI decidir o que fazer -
// ler/escrever arquivo, rodar comando etc. sempre acontece no Mac do usuário,
// nunca aqui no Railway. Reaproveita a cota do Sol (mesmo sistema de sempre).
app.post("/synapsys/agent", requireUser, async (req, res) => {
  try {
    const { messages, tools } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages é obrigatório e deve ser um array não vazio." });
    }
    if (!openai) {
      return res.status(500).json({ error: "OpenAI não configurada: OPENAI_API_KEY ausente." });
    }

    let accessRow = await getOrCreateAccess(req.db, req.user.id);
    accessRow = await resetUsageIfDue(req.db, req.user.id, accessRow);

    if (accessRow && isBlockedByLimit(accessRow, "sol")) {
      const suspended = accessRow.status === "blocked" || accessRow.status === "canceled";
      return res.status(suspended ? 403 : 429).json({
        error: suspended
          ? "Sua conta está suspensa."
          : `Você atingiu o limite mensal do Sol no plano ${accessRow.tier}. O Agente Local usa sempre o Sol (é o modelo com melhor tool calling).`,
      });
    }

    const completion = await openai.chat.completions.create({
      model: resolveOpenAIModel("sol", false),
      messages,
      tools: Array.isArray(tools) && tools.length ? tools : undefined,
      tool_choice: "auto",
    });

    const choice = completion.choices?.[0]?.message;
    accessRow = await incrementUsage(req.db, req.user.id, accessRow, "sol");

    return res.json({
      message: choice,
      usage: accessRow ? { sol_used: accessRow.sol_messages_used, sol_limit: accessRow.sol_monthly_limit } : null,
    });
  } catch (error) {
    console.error("[synapsys-agent] erro:", error.message);
    return res.status(500).json({ error: "Erro ao processar o agente: " + error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    provider: process.env.AI_PROVIDER || "openai",
    openai_configured: !!openai,
    groq_configured: !!groq,
    claude_configured: !!anthropic,
    openai_model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    groq_model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    claude_model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    synapsys_domain: SYNAPSYS_DOMAIN,
    synapsys_url: SYNAPSYS_URL,
  });
});

app.get("/disc/base", (req, res) => {
  return res.json({
    ok: true,
    factors: Object.keys(discBase),
    discBase,
  });
});

app.get("/bootstrap-admin", async (req, res) => {
  try {
    const user = {
      name: "Marcelo Feuser",
      email: "admin@synapsys.ai",
      role: "SUPER_ADMIN",
      createdAt: new Date(),
    };

    console.log("🔥 SUPER ADMIN CRIADO:", user);

    return res.json({
      success: true,
      user,
    }); 
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: "email, password e name são obrigatórios" });
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  if (data.user) {
    await supabase.from("users").insert({ id: data.user.id, email, name });
  }
  res.json({ message: "Cadastro realizado.", user: data.user });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email e password são obrigatórios" });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ token: data.session.access_token, user: { id: data.user.id, email: data.user.email } });
});

app.get("/auth/me", requireUser, (req, res) => {
  res.json({ user: req.user });
});

// ════════════════════════════════════════════════════════
//  BILLING — Stripe Checkout e Customer Portal
// ════════════════════════════════════════════════════════

// Cria a sessão de Checkout e devolve a URL — o frontend só faz
// window.location.href = url. Reaproveita o stripe_customer_id salvo se o
// usuário já tiver assinado antes (evita duplicar Customer no Stripe).
//
// FIX 21/08/2026: se a pessoa JÁ tem uma assinatura paga ativa e troca de
// plano, isso não passa mais pelo Checkout — checkout sempre cria uma
// assinatura NOVA, então quem já assinava acabava com duas assinaturas
// simultâneas, cobradas em paralelo (foi pego num teste real: Córtex
// mensal + Rede anual ativos ao mesmo tempo na mesma conta). Em vez disso,
// troca o preço dentro da assinatura que já existe — a Stripe cobra só a
// diferença proporcional sozinha (changeSubscriptionPlan, em billing.js).
app.post("/billing/checkout", requireUser, async (req, res) => {
  const { tier, cycle } = req.body || {};
  if (!isValidTier(tier) || !isValidCycle(cycle)) {
    return res.status(400).json({ error: "Plano ou ciclo de cobrança inválido." });
  }

  try {
    let accessRow = null;
    if (req.db) {
      try {
        accessRow = await getOrCreateAccess(req.db, req.user.id);
      } catch (_) {
        // sem linha de acesso ainda — segue sem customer existente, o
        // Stripe cria um novo e o webhook grava o id no checkout.session.completed
      }
    }

    const hasActiveSubscription =
      accessRow && accessRow.stripe_subscription_id && accessRow.status === "active" && accessRow.tier !== "free";

    if (hasActiveSubscription) {
      if (accessRow.tier === tier) {
        return res.status(400).json({ error: "Você já está nesse plano." });
      }
      await changeSubscriptionPlan({
        subscriptionId: accessRow.stripe_subscription_id,
        userId: req.user.id,
        tier,
        cycle,
      });
      return res.json({ changed: true });
    }

    const session = await createCheckoutSession({
      userId: req.user.id,
      userEmail: req.user.email,
      tier,
      cycle,
      successUrl: `${FRONTEND_URL}/app?checkout=success`,
      cancelUrl: `${FRONTEND_URL}/?checkout=cancel`,
      existingCustomerId: accessRow?.stripe_customer_id || null,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("[billing-checkout]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Customer Portal — autoatendimento: o usuário troca cartão, cancela ou
// baixa fatura sozinho, sem precisar pedir pra alguém mexer no Supabase.
app.post("/billing/portal", requireUser, async (req, res) => {
  try {
    if (!req.db) return res.status(401).json({ error: "Não autenticado." });
    const accessRow = await getOrCreateAccess(req.db, req.user.id);
    if (!accessRow.stripe_customer_id) {
      return res.status(400).json({ error: "Você ainda não tem uma assinatura Stripe ativa." });
    }

    const session = await createPortalSession({
      customerId: accessRow.stripe_customer_id,
      returnUrl: `${FRONTEND_URL}/app`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("[billing-portal]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════
//  SYNAPSYS WORKSPACE — pastas (projects), conversas e busca
// ════════════════════════════════════════════════════════

app.get("/api/synapsys/bootstrap", requireUser, async (req, res) => {
  try {
    const filter = normalizeConversationFilter(req.query.filter || "30d");
    const rangeStart = getRangeStart(filter);
    const limit = toPositiveInteger(req.query.limit, 40, 120);

    const [projects, recentConversations, conversations] = await Promise.all([
      listProjects(req.db, req.user.id),
      listRecentConversations(req.db, req.user.id, 10),
      listConversations(req.db, req.user.id, { filter, rangeStart, limit }),
    ]);

    // Uso do plano pro termômetro do chat. Erro aqui não deve derrubar o
    // bootstrap inteiro — só significa que o termômetro fica sem dado.
    let usage = null;
    if (req.db) {
      try {
        const accessRow = await resetUsageIfDue(req.db, req.user.id, await getOrCreateAccess(req.db, req.user.id));
        usage = usageSummary(accessRow);
      } catch (accessError) {
        if (!isMissingAccessTableError(accessError)) {
          console.error("[synapsys-access] Falha ao carregar uso no bootstrap:", accessError.message);
        }
      }
    }

    return res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.user_metadata?.name || req.user.email?.split("@")[0] || "Usuário Synapsys",
      },
      projects,
      recentConversations,
      conversations,
      defaultFilter: filter,
      usage,
    });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível carregar a área da Synapsys.");
  }
});

app.get("/api/synapsys/conversations/recent", requireUser, async (req, res) => {
  try {
    const limit = toPositiveInteger(req.query.limit, 10, 20);
    const recentConversations = await listRecentConversations(req.db, req.user.id, limit);
    return res.json({ items: recentConversations });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível carregar os chats recentes.");
  }
});

app.get("/api/synapsys/conversations", requireUser, async (req, res) => {
  try {
    const { filter, rangeStart, projectId } = getWorkspaceFilter(req);
    const limit = toPositiveInteger(req.query.limit, 60, 200);
    const conversations = await listConversations(req.db, req.user.id, {
      filter,
      rangeStart,
      projectId,
      limit,
    });
    return res.json({ items: conversations, filter });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível listar as conversas.");
  }
});

app.post("/api/synapsys/conversations", requireUser, async (req, res) => {
  try {
    const rawTitle = String(req.body?.title || "").trim();
    const conversation = await createConversation(req.db, req.user.id, {
      title: rawTitle || "Nova conversa",
      projectId: String(req.body?.projectId || "").trim() || null,
    });
    return res.status(201).json({ conversation });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível criar a conversa.");
  }
});

app.get("/api/synapsys/conversations/:conversationId", requireUser, async (req, res) => {
  try {
    const conversation = await getConversation(req.db, req.user.id, req.params.conversationId, {
      markOpened: true,
    });
    return res.json({ conversation });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível carregar a conversa.");
  }
});

app.patch("/api/synapsys/conversations/:conversationId", requireUser, async (req, res) => {
  try {
    if (req.body?.title !== undefined && !String(req.body.title || "").trim()) {
      return res.status(400).json({ error: "O título da conversa não pode ficar vazio." });
    }

    const conversation = await updateConversation(req.db, req.user.id, req.params.conversationId, {
      title: req.body?.title !== undefined ? String(req.body.title || "").trim() : undefined,
      projectId:
        req.body?.projectId !== undefined ? String(req.body.projectId || "").trim() || null : undefined,
      archivedAt:
        req.body?.archived !== undefined
          ? req.body.archived
            ? new Date().toISOString()
            : null
          : undefined,
      lastOpenedAt: req.body?.markOpened ? new Date().toISOString() : undefined,
    });

    return res.json({ conversation });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível atualizar a conversa.");
  }
});

app.delete("/api/synapsys/conversations/:conversationId", requireUser, async (req, res) => {
  try {
    await deleteConversation(req.db, req.user.id, req.params.conversationId);
    return res.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível excluir a conversa.");
  }
});

app.get("/api/synapsys/projects", requireUser, async (req, res) => {
  try {
    const projects = await listProjects(req.db, req.user.id);
    return res.json({ items: projects });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível listar as pastas.");
  }
});

app.post("/api/synapsys/projects", requireUser, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "O nome da pasta é obrigatório." });
    }

    const project = await createProject(req.db, req.user.id, {
      name,
      description: req.body?.description,
      color: req.body?.color,
      icon: req.body?.icon,
    });

    return res.status(201).json({ project });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível criar a pasta.");
  }
});

app.patch("/api/synapsys/projects/:projectId", requireUser, async (req, res) => {
  try {
    if (req.body?.name !== undefined && !String(req.body.name || "").trim()) {
      return res.status(400).json({ error: "O nome da pasta não pode ficar vazio." });
    }

    const project = await updateProject(req.db, req.user.id, req.params.projectId, {
      name: req.body?.name,
      description: req.body?.description,
      color: req.body?.color,
      icon: req.body?.icon,
      archivedAt:
        req.body?.archived !== undefined
          ? req.body.archived
            ? new Date().toISOString()
            : null
          : undefined,
    });

    return res.json({ project });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível atualizar a pasta.");
  }
});

app.delete("/api/synapsys/projects/:projectId", requireUser, async (req, res) => {
  try {
    await deleteProject(req.db, req.user.id, req.params.projectId);
    return res.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível excluir a pasta.");
  }
});

app.get("/api/synapsys/search", requireUser, async (req, res) => {
  try {
    const term = String(req.query.q || req.query.term || "").trim();
    if (!term) {
      return res.json({ items: [] });
    }

    const { filter, rangeStart, projectId } = getWorkspaceFilter(req);
    const limit = toPositiveInteger(req.query.limit, 30, 100);
    const items = await searchWorkspace(req.db, req.user.id, {
      term,
      filter,
      rangeStart,
      projectId,
      limit,
    });

    return res.json({ items, filter, term });
  } catch (error) {
    return handleWorkspaceError(res, error, "Não foi possível concluir a busca.");
  }
});

// Quantas mensagens anteriores (usuário + assistente, somadas) entram no
// contexto mandado pra IA a cada nova pergunta. Sem isso, cada chamada ao
// provider era um turno isolado — só sistema + mensagem atual — e a IA
// "esquecia" tudo que já tinha sido dito na mesma conversa, mesmo com o
// histórico salvo no banco (o banco alimentava só a sidebar, nunca o
// prompt). 24 mensagens (~12 idas e vindas) equilibra memória real de
// conversa com custo/latência por chamada.
const MAX_HISTORY_MESSAGES = 24;

app.post("/synapsys/analyze", requireUser, async (req, res) => {
  const t0 = Date.now();
  const { input, mode, images: rawImages, stream, conversationId: rawConversationId, projectId: rawProjectId, model: rawModel } = req.body;
  const isAutoRoute = rawModel === "auto";

  if (!input && !(Array.isArray(rawImages) && rawImages.length)) {
    return res.status(400).json({ error: "Input é obrigatório" });
  }

  let images = [];
  if (Array.isArray(rawImages) && rawImages.length) {
    if (rawImages.length > 4) {
      return res.status(400).json({ error: "Máximo de 4 imagens por mensagem" });
    }
    try {
      images = rawImages.map((dataUrl) => {
        const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
        if (!match) throw new Error("Formato de imagem inválido");
        return { dataUrl, mediaType: match[1], base64: match[2] };
      });
    } catch (imgErr) {
      return res.status(400).json({ error: imgErr.message });
    }
  }

  const effectiveInput = input || "Descreva a imagem enviada.";

  // ─── Memória: cria/atualiza a conversa e salva a mensagem do usuário
  // ANTES de gerar a resposta, pra nunca perder o lado do usuário mesmo
  // que a IA falhe. Qualquer erro aqui apenas desliga a persistência
  // desta mensagem — nunca derruba o chat em si.
  let conversation = null;
  let persistenceEnabled = !!(req.user && req.db);
  let persistenceWarning = null;
  const conversationId = String(rawConversationId || "").trim() || null;
  const projectId = String(rawProjectId || "").trim() || null;

  // ─── Cota diária por plano (Sinapse/Córtex/Rede): busca ANTES de tocar
  // em histórico, persistência ou IA. Buscada antes de decidir o modelo
  // porque o roteamento automático (abaixo) precisa saber a cota atual
  // pra não escolher um nível que já está esgotado.
  let accessRow = null;
  if (persistenceEnabled) {
    try {
      accessRow = await resetUsageIfDue(req.db, req.user.id, await getOrCreateAccess(req.db, req.user.id));
    } catch (accessError) {
      if (!isMissingAccessTableError(accessError)) {
        console.error("[synapsys-access] Falha ao checar cota de uso:", accessError.message);
      }
      accessRow = null; // sem tabela/erro: segue sem bloquear, só sem termômetro
    }
  }

  // ─── Roteamento de profundidade: modo automático (model:"auto", vindo
  // do seletor "Automático" no header) classifica sol/terra/luna com base
  // na pergunta e na cota disponível; modo manual usa exatamente o nível
  // que a pessoa escolheu no dropdown, como sempre funcionou.
  let modelKey = resolveModelKey(rawModel);
  if (isAutoRoute) {
    modelKey = await classifyModelKey({
      input: effectiveInput,
      hasImages: Array.isArray(rawImages) && rawImages.length > 0,
      accessRow,
      isBlockedByLimit,
      openaiProvider,
    });
  }

  if (accessRow && isBlockedByLimit(accessRow, modelKey)) {
    const suspended = accessRow.status === "blocked" || accessRow.status === "canceled";
    const modelLabel = MODEL_LABELS[modelKey] || modelKey;
    const isMonthly = modelKey === "sol";
    return res.status(suspended ? 403 : 429).json({
      error: suspended
        ? "Seu acesso à Synapsys está suspenso. Fale com o suporte."
        : `Você atingiu o limite ${isMonthly ? "mensal" : "diário"} do modelo ${modelLabel} no plano ${accessRow.tier}. ` +
          `${isMonthly ? "Volta no próximo ciclo" : "Volta amanhã"}, troca pra outro modelo, ou considera fazer upgrade.`,
      usage: usageSummary(accessRow),
    });
  }

  // ─── Histórico: busca as mensagens já trocadas nessa conversa ANTES de
  // gravar a mensagem atual, pra montar o contexto que vai pra IA. Sem
  // isso a IA nunca via o que já tinha sido dito — só o banco via.
  let history = [];
  if (persistenceEnabled && conversationId) {
    try {
      const existing = await getConversation(req.db, req.user.id, conversationId);
      history = existing.messages
        .filter((message) => message.content && (message.role === "user" || message.role === "assistant"))
        .slice(-MAX_HISTORY_MESSAGES)
        .map((message) => ({ role: message.role, content: message.content }));
    } catch (historyError) {
      console.error("[synapsys-persist] Falha ao carregar histórico da conversa:", historyError.message);
    }
  }

  if (persistenceEnabled) {
    try {
      if (conversationId) {
        conversation = await updateConversation(req.db, req.user.id, conversationId, {
          archivedAt: null,
          lastOpenedAt: new Date().toISOString(),
          ...(projectId ? { projectId } : {}),
        });
      } else {
        conversation = await createConversation(req.db, req.user.id, {
          title: buildConversationTitle(effectiveInput),
          projectId,
        });
      }

      await addConversationMessage(req.db, conversation.id, "user", effectiveInput);
    } catch (persistError) {
      if (isMissingSynapsysTableError(persistError)) {
        persistenceWarning = "Persistência indisponível.";
      } else {
        console.error("[synapsys-persist] Falha ao salvar mensagem do usuário:", persistError.message);
      }
      persistenceEnabled = false;
      conversation = null;
    }
  }

  async function persistAssistantReply(text) {
    if (!persistenceEnabled || !conversation || !text) return;
    try {
      await addConversationMessage(req.db, conversation.id, "assistant", text);
      conversation = await updateConversation(req.db, req.user.id, conversation.id, {
        archivedAt: null,
        lastOpenedAt: new Date().toISOString(),
      });
    } catch (persistError) {
      console.error("[synapsys-persist] Falha ao salvar resposta da IA:", persistError.message);
    }

    // +1 na cota do dia — só conta depois de uma resposta que de fato saiu.
    // Uma requisição que deu erro antes de chegar aqui não consome cota.
    if (accessRow) {
      try {
        accessRow = await incrementUsage(req.db, req.user.id, accessRow, modelKey);
      } catch (usageError) {
        console.error("[synapsys-access] Falha ao registrar uso:", usageError.message);
      }
    }
  }

  // ─── Modo streaming (SSE): manda pedaços de texto assim que chegam ───
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const abortController = new AbortController();
    // BUG: usar req.on("close", ...) aqui abortava TODA requisição em
    // streaming quase instantaneamente. No Express 5, o evento "close"
    // do REQUEST dispara assim que o corpo já foi lido (pelo
    // express.json(), antes do handler rodar) — não apenas quando o
    // cliente realmente desconecta. Resultado: toda mensagem do chat
    // era cancelada nos primeiros milissegundos, antes da IA responder.
    // A forma correta de detectar desconexão real do cliente é ouvir o
    // "close" da RESPONSE e checar se ela já tinha terminado normalmente
    // (res.writableEnded) — só abortamos se NÃO tiver terminado.
    res.on("close", () => {
      if (!res.writableEnded) abortController.abort();
    });

    let fullText = "";
    try {
      const source = await streamInsight(
        effectiveInput,
        mode || "builder",
        images,
        (delta) => {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        },
        abortController.signal,
        history,
        modelKey
      );

      await persistAssistantReply(fullText);
      res.write(`data: ${JSON.stringify({ done: true, source, conversation, usage: accessRow ? usageSummary(accessRow) : null, modelKeyUsed: isAutoRoute ? modelKey : null })}\n\n`);
      res.end();
      trackRequest({ input: effectiveInput, output: fullText, source, durationMs: Date.now() - t0, error: false });
    } catch (error) {
      if (error.name === "AbortError") {
        // Cliente cancelou (botão de parar) — não é um erro de verdade.
        await persistAssistantReply(fullText ? `${fullText}\n\n_(interrompido)_` : "");
        trackRequest({ input: effectiveInput, output: fullText, source: "aborted", durationMs: Date.now() - t0, error: false });
        return res.end();
      }
      console.error("ERRO IA (stream):", error.message);
      trackRequest({ input: effectiveInput, output: fullText, source: "error", durationMs: Date.now() - t0, error: true });
      try {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      } catch (_) { /* conexão já pode ter caído */ }
    }
    return;
  }

  // ─── Modo tradicional (resposta única em JSON) — mantido por compatibilidade ───
  try {
    const { text, source } = await generateInsight(effectiveInput, mode || "builder", images, history, modelKey);
    const durationMs = Date.now() - t0;

    await persistAssistantReply(text);
    trackRequest({ input: effectiveInput, output: text, source, durationMs, error: false });

    return res.json({
      success: true,
      source,
      mode: mode || "builder",
      response: text,
      conversation,
      usage: accessRow ? usageSummary(accessRow) : null,
      modelKeyUsed: isAutoRoute ? modelKey : null,
    });
  } catch (error) {
    console.error("ERRO IA:", error.message);
    trackRequest({ input: effectiveInput, output: "", source: "error", durationMs: Date.now() - t0, error: true });

    return res.status(500).json({
      success: false,
      source: "error",
      response:
        "Não foi possível processar sua mensagem. Verifique as variáveis de ambiente do provider configurado.",
      error: error.message,
    });
  }
});

// ════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ════════════════════════════════════════════════════════

// Login — retorna token de sessão
app.post("/superadmin/login", (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Senha incorreta" });
  }
  const token = `sat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  activeSessions.add(token);
  // expira em 8h
  setTimeout(() => activeSessions.delete(token), 8 * 60 * 60 * 1000);
  res.json({ token });
});

// Logout
app.post("/superadmin/logout", adminAuth, (req, res) => {
  const token = req.headers["x-admin-token"] || req.query.token;
  activeSessions.delete(token);
  res.json({ ok: true });
});

// Página do super admin — HTML autocontido, protegido por senha no
// próprio front (não pelo adminAuth, senão ninguém conseguiria nem ver a
// tela de login). Os dados de verdade só saem pelas rotas /superadmin/api/*
// abaixo, essas sim atrás de adminAuth.
app.get("/superadmin", (req, res) => {
  res.type("html").send(renderAdminPage());
});

// ─── Gestão de usuários (tier, status, cota por modelo) ───
// Substitui o fluxo manual descrito em claude/pricing-decision.md ("mudar
// o plano de alguém hoje é editar tier + 6 colunas direto no Supabase").
app.get("/superadmin/api/users", adminAuth, async (req, res) => {
  try {
    const items = await listUsersWithAccess(supabaseService);
    return res.json({ items });
  } catch (error) {
    console.error("[admin-users] Falha ao listar usuários:", error.message);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.patch("/superadmin/api/users/:userId", adminAuth, async (req, res) => {
  try {
    const access = await upsertUserAccess(supabaseService, req.params.userId, req.body || {});
    return res.json({ access });
  } catch (error) {
    console.error("[admin-users] Falha ao atualizar usuário:", error.message);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Stats do dashboard
app.get("/superadmin/stats", adminAuth, (req, res) => {
  const avgResponse = stats.responseTimes.length
    ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
    : 0;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: stats.requestsPerDay[key] || 0 };
  });

  res.json({
    totalRequests: stats.totalRequests,
    totalErrors: stats.totalErrors,
    errorRate: stats.totalRequests ? ((stats.totalErrors / stats.totalRequests) * 100).toFixed(1) : "0.0",
    avgResponseMs: avgResponse,
    uptime: Math.round((Date.now() - new Date(stats.startedAt).getTime()) / 1000),
    startedAt: stats.startedAt,
    last7Days,
    providers: {
      openai: { configured: !!openai, model: process.env.OPENAI_MODEL || "gpt-4.1-mini" },
      groq:   { configured: !!groq,   model: process.env.GROQ_MODEL || "llama-3.1-8b-instant" },
      claude: { configured: !!anthropic, model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6" },
      active: runtimeConfig.aiProvider || process.env.AI_PROVIDER || "openai",
    },
  });
});

// Logs recentes
app.get("/superadmin/logs", adminAuth, (req, res) => {
  res.json({ logs: stats.recentLogs });
});

// Config atual
app.get("/superadmin/config", adminAuth, (req, res) => {
  res.json({
    aiProvider:           runtimeConfig.aiProvider || process.env.AI_PROVIDER || "openai",
    openaiModel:          runtimeConfig.openaiModel || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    groqModel:            runtimeConfig.groqModel || process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    claudeModel:          runtimeConfig.claudeModel || process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    temperature:          runtimeConfig.temperature ?? 0.3,
    systemPromptOverride: runtimeConfig.systemPromptOverride || null,
    baseDomain:           process.env.BASE_DOMAIN || "insightdisc.com",
  });
});

// Atualizar config em runtime
app.post("/superadmin/config", adminAuth, (req, res) => {
  const { aiProvider, openaiModel, groqModel, claudeModel, temperature, systemPromptOverride } = req.body;
  if (aiProvider)            runtimeConfig.aiProvider = aiProvider;
  if (openaiModel)           runtimeConfig.openaiModel = openaiModel;
  if (groqModel)             runtimeConfig.groqModel = groqModel;
  if (claudeModel)           runtimeConfig.claudeModel = claudeModel;
  if (temperature !== undefined) runtimeConfig.temperature = Number(temperature);
  if (systemPromptOverride !== undefined) runtimeConfig.systemPromptOverride = systemPromptOverride || null;

  console.log("⚙️ Config atualizada pelo admin:", runtimeConfig);
  res.json({ ok: true, config: runtimeConfig });
});

const PORT = Number(process.env.PORT) || 4010;


// ─────────────────────────────────────────────
// DISC PREMIUM REPORT
// ─────────────────────────────────────────────
app.post("/generate-disc-report", async (req, res) => {
  try {
    const { scores } = req.body;

    if (!scores || typeof scores !== "object") {
      return res.status(400).json({ error: "Scores DISC são obrigatórios" });
    }

    const html = await renderDiscReport(req.body);

    const puppeteer = require("puppeteer");

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "8mm",
        bottom: "8mm",
        left: "8mm",
        right: "8mm"
      }
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=relatorio-disc-premium.pdf"
    });

    res.send(pdf);
  } catch (error) {
    console.error("ERRO DISC:", error);
    res.status(500).json({
      error: error?.message || "Erro ao gerar relatório DISC premium",
      stack: error?.stack || null
    });
  }
});


app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(
    `   Sol/Terra/Luna (GPT-5.6) : ${
      openai
        ? "✅ ativo — todos os 3 modelos via OpenAI"
        : "❌ inativo (OPENAI_API_KEY não definida — Sol, Terra e Luna não vão funcionar)"
    }`
  );
  if (openai) {
    console.log(`     Sol   : ${OPENAI_MODEL_BY_KEY.sol}`);
    console.log(`     Terra : ${OPENAI_MODEL_BY_KEY.terra}`);
    console.log(`     Luna  : ${OPENAI_MODEL_BY_KEY.luna}\n`);
  }
});

// rate limit simples por IP
const usage = new Map();

app.use('/synapsys/analyze', (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  if (!usage.has(ip)) {
    usage.set(ip, { count: 1, time: now });
    return next();
  }

  const data = usage.get(ip);

  if (now - data.time > 60000) {
    usage.set(ip, { count: 1, time: now });
    return next();
  }

  if (data.count > 20) {
    return res.status(429).json({ error: 'Limite de uso atingido' });
  }

  data.count++;
  next();
});
