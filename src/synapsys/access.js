// ─── Controle de uso por plano E por modelo (Sol/Terra/Luna) ───
// Primeira versão (20/08/2026, manhã) tinha um único contador de
// mensagens/dia por usuário, sem olhar qual modelo foi usado — deixava o
// plano Rede "ilimitado" de verdade e não protegia contra alguém gastar
// toda a cota no Sol (modelo ~54x mais caro que o Luna por mensagem).
// Esta versão (20/08/2026, noite) implementa cota de verdade por modelo,
// batendo com o cálculo de custo/margem da planilha: Sol tem teto MENSAL
// (é caro, uso deve ser esporádico), Terra e Luna têm teto DIÁRIO
// (baratos o bastante pra suportar uso pesado todo dia).

const PRODUCT_KEY = "synapsys";
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // janela rolante de 24h (Terra e Luna)
const MONTHLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // janela rolante de 30 dias (Sol)

// Mapeia o id do modelo mandado pelo frontend (App.jsx > MODELS) pra chave
// interna. Qualquer id desconhecido cai em "terra" (o modelo equilibrado)
// em vez de travar a requisição.
const MODEL_KEY_BY_ID = {
  "gpt-5.6-sol": "sol",
  "gpt-5.6-terra": "terra",
  "gpt-5.6-luna": "luna",
};

function resolveModelKey(rawModelId) {
  return MODEL_KEY_BY_ID[rawModelId] || "terra";
}

// Cota de cada modelo por plano, usada só quando uma linha de acesso é
// criada do zero. Depois disso quem manda são as colunas salvas na própria
// linha em synapsys_access — mudar o plano de alguém é atualizar essas
// colunas direto no Supabase.
// Recalculado em 20/08/2026 (noite) com os preços finais (R$49,90/89,90/199,90)
// — ver claude/pricing-decision.md pro racional completo de margem.
const TIER_MODEL_LIMITS = {
  free: { sol: 0, terra: 2, luna: 15 },
  sinapse: { sol: 3, terra: 8, luna: 100 },
  cortex: { sol: 10, terra: 16, luna: 160 },
  rede: { sol: 55, terra: 28, luna: 330 },
};

const MODEL_LABELS = { sol: "Sol", terra: "Terra", luna: "Luna" };

function unwrap(result, context) {
  if (result.error) {
    const error = new Error(`${context}: ${result.error.message}`);
    error.cause = result.error;
    throw error;
  }
  return result.data;
}

function isMissingAccessTableError(error) {
  const message = String(error?.cause?.message || error?.message || "").toLowerCase();
  return (
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("could not find the table") && message.includes("synapsys_access")) ||
    (message.includes("could not find") && message.includes("column"))
  );
}

// Busca a linha de acesso do usuário; cria uma no tier "free" se ainda não
// existir (cobre quem se cadastrou direto pelo Supabase Auth, sem passar
// por nenhuma rota que crie essa linha).
async function getOrCreateAccess(client, userId) {
  const existing = unwrap(
    await client
      .from("synapsys_access")
      .select("*")
      .eq("user_id", userId)
      .eq("product_key", PRODUCT_KEY)
      .maybeSingle(),
    "Falha ao buscar acesso do usuário"
  );

  if (existing) return existing;

  const free = TIER_MODEL_LIMITS.free;
  const inserted = unwrap(
    await client
      .from("synapsys_access")
      .insert({
        user_id: userId,
        product_key: PRODUCT_KEY,
        tier: "free",
        status: "active",
        sol_monthly_limit: free.sol,
        sol_messages_used: 0,
        sol_reset_at: new Date(Date.now() + MONTHLY_WINDOW_MS).toISOString(),
        terra_daily_limit: free.terra,
        terra_messages_used: 0,
        luna_daily_limit: free.luna,
        luna_messages_used: 0,
        usage_reset_at: new Date(Date.now() + DAILY_WINDOW_MS).toISOString(),
      })
      .select("*")
      .single(),
    "Falha ao criar acesso do usuário"
  );

  return inserted;
}

// Reseta os contadores cujas janelas já passaram: Terra+Luna compartilham a
// janela diária (usage_reset_at), Sol tem a sua própria janela mensal
// (sol_reset_at) — são independentes, então uma pode resetar sem mexer na
// outra (ex.: reseta Terra/Luna de hoje sem tocar no contador do Sol).
async function resetUsageIfDue(client, userId, row) {
  const now = Date.now();
  const dailyDue = !row.usage_reset_at || now >= new Date(row.usage_reset_at).getTime();
  const monthlyDue = !row.sol_reset_at || now >= new Date(row.sol_reset_at).getTime();

  if (!dailyDue && !monthlyDue) return row;

  const patch = {};
  if (dailyDue) {
    patch.terra_messages_used = 0;
    patch.luna_messages_used = 0;
    patch.usage_reset_at = new Date(now + DAILY_WINDOW_MS).toISOString();
  }
  if (monthlyDue) {
    patch.sol_messages_used = 0;
    patch.sol_reset_at = new Date(now + MONTHLY_WINDOW_MS).toISOString();
  }

  const updated = unwrap(
    await client
      .from("synapsys_access")
      .update(patch)
      .eq("user_id", userId)
      .eq("product_key", PRODUCT_KEY)
      .select("*")
      .single(),
    "Falha ao resetar uso"
  );

  return updated;
}

// +1 mensagem no contador do modelo usado nesta resposta. Só é chamado
// depois de uma resposta da IA gerada com sucesso — uma requisição que
// falhou não consome a cota do usuário.
async function incrementUsage(client, userId, row, modelKey) {
  const column = `${modelKey}_messages_used`;
  const current = row[column] || 0;

  const updated = unwrap(
    await client
      .from("synapsys_access")
      .update({ [column]: current + 1 })
      .eq("user_id", userId)
      .eq("product_key", PRODUCT_KEY)
      .select("*")
      .single(),
    "Falha ao registrar uso"
  );

  return updated;
}

// Bloqueia se a conta estiver suspensa/cancelada, OU se o modelo pedido
// nesta requisição específica já bateu o teto dele. Um usuário que estourou
// o Sol continua liberado no Terra/Luna — o bloqueio é por modelo, não
// geral, pra não travar o chat inteiro por causa só do modelo mais caro.
function isBlockedByLimit(row, modelKey) {
  if (row.status === "blocked" || row.status === "canceled") return true;

  const limitCol = modelKey === "sol" ? "sol_monthly_limit" : `${modelKey}_daily_limit`;
  const limit = row[limitCol];
  if (limit == null) return false; // sem limite configurado pra esse modelo

  const used = row[`${modelKey}_messages_used`] || 0;
  return used >= limit;
}

function modelSummary(row, modelKey, period) {
  const limitCol = period === "monthly" ? "sol_monthly_limit" : `${modelKey}_daily_limit`;
  const usedCol = `${modelKey}_messages_used`;
  const resetAt = period === "monthly" ? row.sol_reset_at : row.usage_reset_at;
  const limit = row[limitCol];

  return {
    limit,
    used: row[usedCol] || 0,
    unlimited: limit == null,
    period,
    resetAt,
  };
}

// Formato enxuto que vai pro frontend (termômetro + payload de resposta) —
// um bloco por modelo, cada um com seu próprio limite/uso/janela.
function usageSummary(row) {
  return {
    tier: row.tier,
    status: row.status,
    sol: modelSummary(row, "sol", "monthly"),
    terra: modelSummary(row, "terra", "daily"),
    luna: modelSummary(row, "luna", "daily"),
  };
}

module.exports = {
  TIER_MODEL_LIMITS,
  MODEL_LABELS,
  resolveModelKey,
  getOrCreateAccess,
  resetUsageIfDue,
  incrementUsage,
  isBlockedByLimit,
  isMissingAccessTableError,
  usageSummary,
};
