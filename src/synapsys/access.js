// ─── Controle de uso por plano (Sinapse/Córtex/Rede) ───
// A tabela synapsys_access já existia no banco (criada num momento anterior
// do produto, com tiers "free"/"premium"), mas nunca foi lida nem escrita
// pelo backend — o limite diário nela configurado nunca teve efeito
// nenhum. Este módulo é o que efetivamente aplica o limite e mantém o
// contador de uso, além de alimentar o termômetro que aparece no chat.

const PRODUCT_KEY = "synapsys";
const RESET_WINDOW_MS = 24 * 60 * 60 * 1000; // janela rolante de 24h

// Limite diário de mensagens por plano. `null` = sem limite (plano Rede).
// Isso é só o valor usado quando uma linha de acesso é criada do zero
// (primeiro acesso do usuário) — depois disso, quem manda é o valor salvo
// na própria linha em synapsys_access, então mudar um usuário de plano é
// só atualizar `tier` + `daily_message_limit` nessa tabela.
const TIER_DAILY_LIMIT = {
  free: 10,
  sinapse: 30,
  cortex: 100,
  rede: null,
};

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
    (message.includes("could not find the table") && message.includes("synapsys_access"))
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

  const inserted = unwrap(
    await client
      .from("synapsys_access")
      .insert({
        user_id: userId,
        product_key: PRODUCT_KEY,
        tier: "free",
        status: "active",
        daily_message_limit: TIER_DAILY_LIMIT.free,
        daily_messages_used: 0,
        usage_reset_at: new Date(Date.now() + RESET_WINDOW_MS).toISOString(),
      })
      .select("*")
      .single(),
    "Falha ao criar acesso do usuário"
  );

  return inserted;
}

// Reseta o contador se a janela de 24h já passou. Retorna a linha (nova ou
// a mesma) já pronta pra checar limite.
async function resetUsageIfDue(client, userId, row) {
  const resetAt = row.usage_reset_at ? new Date(row.usage_reset_at).getTime() : 0;

  if (Date.now() < resetAt) {
    return row;
  }

  const updated = unwrap(
    await client
      .from("synapsys_access")
      .update({
        daily_messages_used: 0,
        usage_reset_at: new Date(Date.now() + RESET_WINDOW_MS).toISOString(),
      })
      .eq("user_id", userId)
      .eq("product_key", PRODUCT_KEY)
      .select("*")
      .single(),
    "Falha ao resetar uso diário"
  );

  return updated;
}

// +1 mensagem no contador do dia. Só é chamado depois de uma resposta da
// IA gerada com sucesso — uma requisição que falhou não consome a cota do
// usuário.
async function incrementUsage(client, userId, row) {
  const updated = unwrap(
    await client
      .from("synapsys_access")
      .update({ daily_messages_used: (row.daily_messages_used || 0) + 1 })
      .eq("user_id", userId)
      .eq("product_key", PRODUCT_KEY)
      .select("*")
      .single(),
    "Falha ao registrar uso"
  );

  return updated;
}

function isBlockedByLimit(row) {
  if (row.status === "blocked" || row.status === "canceled") return true;
  if (row.daily_message_limit == null) return false; // sem limite
  return (row.daily_messages_used || 0) >= row.daily_message_limit;
}

// Formato enxuto que vai pro frontend (termômetro + payload de resposta).
function usageSummary(row) {
  return {
    tier: row.tier,
    status: row.status,
    limit: row.daily_message_limit, // null = sem limite
    used: row.daily_messages_used || 0,
    unlimited: row.daily_message_limit == null,
    resetAt: row.usage_reset_at,
  };
}

module.exports = {
  TIER_DAILY_LIMIT,
  getOrCreateAccess,
  resetUsageIfDue,
  incrementUsage,
  isBlockedByLimit,
  isMissingAccessTableError,
  usageSummary,
};
