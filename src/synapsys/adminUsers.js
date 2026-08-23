// ─── Painel super admin — gestão de usuários Synapsys ───
// Lista todo mundo cadastrado no Supabase Auth (não só quem já tem linha em
// synapsys_access — cobre quem assinou/cadastrou mas nunca chegou a
// conversar) e junta com a linha de acesso (tier, status, cota por modelo)
// quando ela existir. Usa o client service_role: bypassa RLS (necessário
// pra listar TODO mundo, não só o usuário autenticado) e dá acesso à Admin
// API do Supabase Auth (supabase.auth.admin.listUsers), a única forma de
// pegar e-mail de todos os usuários sem depender da tabela public.users
// (que hoje não é populada por todos os fluxos de cadastro).
const PRODUCT_KEY = "synapsys";
const { TIER_MODEL_LIMITS } = require("./access");

const VALID_TIERS = Object.keys(TIER_MODEL_LIMITS); // free, sinapse, cortex, rede
// Precisa bater com o CHECK constraint de synapsys_access.status no banco.
const VALID_STATUSES = ["trial", "active", "blocked", "canceled"];

function unwrap(result, context) {
  if (result.error) {
    const error = new Error(`${context}: ${result.error.message}`);
    error.cause = result.error;
    throw error;
  }
  return result.data;
}

function requireServiceClient(supabaseService) {
  if (!supabaseService) {
    const error = new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor — o painel admin precisa dela pra listar/editar usuários."
    );
    error.statusCode = 500;
    throw error;
  }
}

// Busca todo mundo no Supabase Auth, paginando (200 por página — dá pra
// aumentar sem problema, a base de usuários hoje é pequena).
async function listAllAuthUsers(supabaseService) {
  const users = [];
  let page = 1;
  const perPage = 200;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabaseService.auth.admin.listUsers({ page, perPage });
    if (error) {
      const err = new Error(`Falha ao listar usuários do Supabase Auth: ${error.message}`);
      err.cause = error;
      throw err;
    }
    users.push(...data.users);
    if (data.users.length < perPage) break;
    page++;
  }

  return users;
}

async function listUsersWithAccess(supabaseService) {
  requireServiceClient(supabaseService);

  const [authUsers, accessRows] = await Promise.all([
    listAllAuthUsers(supabaseService),
    unwrap(
      await supabaseService.from("synapsys_access").select("*").eq("product_key", PRODUCT_KEY),
      "Falha ao listar acessos Synapsys"
    ),
  ]);

  const accessByUserId = new Map(accessRows.map((row) => [row.user_id, row]));

  return authUsers
    .map((user) => {
      const access = accessByUserId.get(user.id) || null;
      return {
        userId: user.id,
        email: user.email || "(sem e-mail)",
        name: user.user_metadata?.name || null,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at || null,
        hasAccess: !!access,
        tier: access?.tier || null,
        status: access?.status || null,
        sol: { limit: access?.sol_monthly_limit ?? null, used: access?.sol_messages_used ?? 0 },
        terra: { limit: access?.terra_daily_limit ?? null, used: access?.terra_messages_used ?? 0 },
        luna: { limit: access?.luna_daily_limit ?? null, used: access?.luna_messages_used ?? 0 },
        stripeCustomerId: access?.stripe_customer_id || null,
        stripeSubscriptionId: access?.stripe_subscription_id || null,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Cria ou atualiza a linha de acesso de um usuário. Se `tier` mudar e o
// admin não mandou limites explícitos junto, aplica os limites padrão do
// novo tier automaticamente (o mesmo comportamento de quando uma linha é
// criada do zero em access.js) — evita esquecer de atualizar as 3 colunas
// de limite na mão depois de trocar o plano.
async function upsertUserAccess(supabaseService, userId, patch = {}) {
  requireServiceClient(supabaseService);

  if (!userId) {
    const error = new Error("userId é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  const existing = unwrap(
    await supabaseService
      .from("synapsys_access")
      .select("*")
      .eq("user_id", userId)
      .eq("product_key", PRODUCT_KEY)
      .maybeSingle(),
    "Falha ao buscar acesso do usuário"
  );

  const update = {};

  if (patch.tier !== undefined) {
    if (!VALID_TIERS.includes(patch.tier)) {
      const error = new Error(`Tier inválido: ${patch.tier}. Use um de: ${VALID_TIERS.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }
    update.tier = patch.tier;

    const defaults = TIER_MODEL_LIMITS[patch.tier];
    if (patch.solLimit === undefined) update.sol_monthly_limit = defaults.sol;
    if (patch.terraLimit === undefined) update.terra_daily_limit = defaults.terra;
    if (patch.lunaLimit === undefined) update.luna_daily_limit = defaults.luna;
  }

  if (patch.status !== undefined) {
    if (!VALID_STATUSES.includes(patch.status)) {
      const error = new Error(`Status inválido: ${patch.status}. Use um de: ${VALID_STATUSES.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }
    update.status = patch.status;
  }

  if (patch.solLimit !== undefined) {
    update.sol_monthly_limit = patch.solLimit === null || patch.solLimit === "" ? null : Number(patch.solLimit);
  }
  if (patch.terraLimit !== undefined) {
    update.terra_daily_limit = patch.terraLimit === null || patch.terraLimit === "" ? null : Number(patch.terraLimit);
  }
  if (patch.lunaLimit !== undefined) {
    update.luna_daily_limit = patch.lunaLimit === null || patch.lunaLimit === "" ? null : Number(patch.lunaLimit);
  }

  if (patch.resetSolUsage) update.sol_messages_used = 0;
  if (patch.resetTerraUsage) update.terra_messages_used = 0;
  if (patch.resetLunaUsage) update.luna_messages_used = 0;

  if (Object.keys(update).length === 0) {
    // Nada pra mudar — devolve o que já existe (ou erro se nem isso existir).
    if (existing) return existing;
    const error = new Error("Nenhum dado enviado e usuário ainda não tem acesso Synapsys.");
    error.statusCode = 400;
    throw error;
  }

  update.updated_at = new Date().toISOString();

  if (existing) {
    return unwrap(
      await supabaseService
        .from("synapsys_access")
        .update(update)
        .eq("user_id", userId)
        .eq("product_key", PRODUCT_KEY)
        .select("*")
        .single(),
      "Falha ao atualizar acesso do usuário"
    );
  }

  // Ainda não existe linha — cria do zero (upsert). Precisa de tier no
  // mínimo pra saber os limites default; sem tier explícito assume "free".
  const tier = update.tier || "free";
  const defaults = TIER_MODEL_LIMITS[tier] || TIER_MODEL_LIMITS.free;

  return unwrap(
    await supabaseService
      .from("synapsys_access")
      .insert({
        user_id: userId,
        product_key: PRODUCT_KEY,
        tier,
        status: update.status || "active",
        sol_monthly_limit: update.sol_monthly_limit ?? defaults.sol,
        terra_daily_limit: update.terra_daily_limit ?? defaults.terra,
        luna_daily_limit: update.luna_daily_limit ?? defaults.luna,
      })
      .select("*")
      .single(),
    "Falha ao criar acesso do usuário"
  );
}

module.exports = {
  listUsersWithAccess,
  upsertUserAccess,
  VALID_TIERS,
  VALID_STATUSES,
};
