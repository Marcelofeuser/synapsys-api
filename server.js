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

const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;

async function requireUser(req, res, next) {
  if (!supabase) {
    req.user = { id: "dev-user" };
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
  next();
}

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5176",
      "http://localhost:5174",
      "http://localhost:5173",
      "https://synapsys-ai.vercel.app",
      "https://app.insightdisc.com",
    ],
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
  console.warn("⚠️ OPENAI_API_KEY não configurada — provider OpenAI desativado");
}

if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} else {
  console.warn("⚠️ GROQ_API_KEY não configurada — provider Groq desativado");
}

if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} else {
  console.warn("⚠️ ANTHROPIC_API_KEY não configurada — provider Claude desativado");
}

let discBase = {};

try {
  discBase = loadDiscBase();
  console.log("✅ Base DISC carregada com sucesso");
} catch (error) {
  console.warn("⚠️ Falha ao carregar base DISC:", error.message);
}

async function openaiProvider(systemPrompt, userInput) {
  if (!openai) {
    throw new Error("OpenAI não configurada: OPENAI_API_KEY ausente nas variáveis de ambiente");
  }

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userInput },
    ],
  });

  return response.choices?.[0]?.message?.content || "";
}

async function groqProvider(systemPrompt, userInput) {
  if (!groq) {
    throw new Error("Groq não configurado: GROQ_API_KEY ausente nas variáveis de ambiente");
  }

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userInput },
    ],
  });

  return completion.choices?.[0]?.message?.content || "";
}

async function claudeProvider(systemPrompt, userInput) {
  if (!anthropic) {
    throw new Error("Claude não configurado: ANTHROPIC_API_KEY ausente nas variáveis de ambiente");
  }

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userInput }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "";
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
async function generateInsight(userInput, mode = "builder") {
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

  const systemPrompt = [basePrompt, modePrompt].filter(Boolean).join("\n\n");
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();

  if (provider === "openai" && openai) {
    const text = await openaiProvider(systemPrompt, userInput);
    return { text, source: "openai" };
  }

  if (provider === "claude" && anthropic) {
    const text = await claudeProvider(systemPrompt, userInput);
    return { text, source: "claude" };
  }

  if (provider === "groq" && groq) {
    try {
      const text = await groqProvider(systemPrompt, userInput);
      return { text, source: "groq" };
    } catch (groqError) {
      console.warn("Groq falhou:", groqError.message);

      if (openai) {
        console.warn("Tentando OpenAI como fallback...");
        const text = await openaiProvider(systemPrompt, userInput);
        return { text, source: "openai-fallback" };
      }

      if (anthropic) {
        console.warn("Tentando Claude como fallback...");
        const text = await claudeProvider(systemPrompt, userInput);
        return { text, source: "claude-fallback" };
      }

      throw new Error(`Groq falhou e não há fallback disponível. Erro: ${groqError.message}`);
    }
  }

  if (openai) {
    const text = await openaiProvider(systemPrompt, userInput);
    return { text, source: "openai-fallback-default" };
  }

  if (groq) {
    const text = await groqProvider(systemPrompt, userInput);
    return { text, source: "groq-fallback-default" };
  }

  if (anthropic) {
    const text = await claudeProvider(systemPrompt, userInput);
    return { text, source: "claude-fallback-default" };
  }

  throw new Error(
    "Nenhum provider de IA configurado. Defina OPENAI_API_KEY, GROQ_API_KEY ou ANTHROPIC_API_KEY nas variáveis de ambiente do Railway."
  );
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
    return res.status(401).json({ error: "Não autorizado. Faça login em /admin/login" });
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

app.post("/synapsys/analyze", requireUser, async (req, res) => {
  const t0 = Date.now();
  try {
    const { input, mode } = req.body;

    if (!input) {
      return res.status(400).json({ error: "Input é obrigatório" });
    }

    const { text, source } = await generateInsight(input, mode || "builder");
    const durationMs = Date.now() - t0;

    trackRequest({ input, output: text, source, durationMs, error: false });

    return res.json({
      success: true,
      source,
      mode: mode || "builder",
      response: text,
    });
  } catch (error) {
    console.error("ERRO IA:", error.message);
    trackRequest({ input: req.body?.input, output: "", source: "error", durationMs: Date.now() - t0, error: true });

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
app.post("/admin/login", (req, res) => {
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
app.post("/admin/logout", adminAuth, (req, res) => {
  const token = req.headers["x-admin-token"] || req.query.token;
  activeSessions.delete(token);
  res.json({ ok: true });
});

// Stats do dashboard
app.get("/admin/stats", adminAuth, (req, res) => {
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
app.get("/admin/logs", adminAuth, (req, res) => {
  res.json({ logs: stats.recentLogs });
});

// Config atual
app.get("/admin/config", adminAuth, (req, res) => {
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
app.post("/admin/config", adminAuth, (req, res) => {
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
  console.log(`   Provider principal : ${process.env.AI_PROVIDER || "openai"}`);
  console.log(
    `   OpenAI             : ${
      openai
        ? "✅ ativo (" + (process.env.OPENAI_MODEL || "gpt-4.1-mini") + ")"
        : "❌ inativo (OPENAI_API_KEY não definida)"
    }`
  );
  console.log(
    `   Groq               : ${
      groq
        ? "✅ ativo (" + (process.env.GROQ_MODEL || "llama-3.1-8b-instant") + ")"
        : "❌ inativo (GROQ_API_KEY não definida)"
    }`
  );
  console.log(
    `   Claude             : ${
      anthropic
        ? "✅ ativo (" + (process.env.CLAUDE_MODEL || "claude-sonnet-4-6") + ")"
        : "❌ inativo (ANTHROPIC_API_KEY não definida)"
    }\n`
  );
});
