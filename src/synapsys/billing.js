// ─── Cobrança via Stripe ───
// Checkout hospedado (não lidamos com número de cartão diretamente),
// Customer Portal (autoatendimento — cancelar/trocar cartão sozinho) e o
// webhook que fecha o loop: quando o Stripe confirma um pagamento ou uma
// assinatura muda de status, este módulo é o que atualiza `tier` +
// os limites por modelo em synapsys_access — SEM depender de ninguém
// editar o Supabase na mão.
//
// Conta Stripe usada: InsightDisc (acct_1T9VRKRwgxkcKRly) — mesma conta
// que já fatura InsightDisc/Psicothera, é só mais um produto lá dentro.
// Ver claude/stripe-integration.md (no projeto) pro histórico completo.

const Stripe = require("stripe");
const { TIER_MODEL_LIMITS } = require("./access");

const PRODUCT_KEY = "synapsys";
const VALID_TIERS = ["sinapse", "cortex", "rede"];
const VALID_CYCLES = ["monthly", "yearly"];

let stripeClient = null;
function getStripe() {
  if (stripeClient) return stripeClient;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

function isValidTier(tier) {
  return VALID_TIERS.includes(tier);
}

function isValidCycle(cycle) {
  return VALID_CYCLES.includes(cycle);
}

// Busca o Price no Stripe pelo lookup_key (ex.: "synapsys_sinapse_monthly")
// em vez de hardcodar o ID — assim o mesmo código funciona em modo teste e
// em modo produção, desde que os lookup_keys existam nos dois (mesmo
// padrão usado ao criar os preços, ver claude/stripe-integration.md).
async function findPrice(stripe, tier, cycle) {
  const lookupKey = `${PRODUCT_KEY}_${tier}_${cycle}`;
  const result = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  return result.data[0] || null;
}

// Cria a Checkout Session (página hospedada do Stripe) pra um usuário
// assinar um plano. Retorna a URL pra onde o frontend redireciona.
async function createCheckoutSession({ userId, userEmail, tier, cycle, successUrl, cancelUrl, existingCustomerId }) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente nas variáveis de ambiente).");
  if (!isValidTier(tier)) throw new Error(`Plano inválido: ${tier}`);
  if (!isValidCycle(cycle)) throw new Error(`Ciclo de cobrança inválido: ${cycle}`);

  const price = await findPrice(stripe, tier, cycle);
  if (!price) throw new Error(`Preço não encontrado no Stripe pra ${tier}/${cycle}. Confira se o lookup_key existe nesta conta/modo.`);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: userId,
    customer: existingCustomerId || undefined,
    customer_email: existingCustomerId ? undefined : (userEmail || undefined),
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { user_id: userId, tier, cycle },
    subscription_data: { metadata: { user_id: userId, tier } },
  });

  return session;
}

// Cria uma sessão do Customer Portal — o usuário troca cartão, cancela ou
// baixa fatura sozinho, sem precisar pedir pra você mexer no Supabase.
async function createPortalSession({ customerId, returnUrl }) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente nas variáveis de ambiente).");
  if (!customerId) throw new Error("Este usuário ainda não tem uma assinatura Stripe associada.");

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}

// Monta o patch de synapsys_access pra um tier — reaproveita a mesma
// tabela TIER_MODEL_LIMITS que o resto do produto usa (access.js), pra
// nunca ter dois lugares diferentes definindo quanto cada plano libera.
function accessPatchForTier(tier) {
  const limits = TIER_MODEL_LIMITS[tier] || TIER_MODEL_LIMITS.free;
  return {
    tier,
    status: "active",
    sol_monthly_limit: limits.sol,
    terra_daily_limit: limits.terra,
    luna_daily_limit: limits.luna,
  };
}

// Processa um evento de webhook já verificado (assinatura conferida em
// server.js antes de chegar aqui). Retorna o que foi feito, só pra log.
async function handleWebhookEvent(client, event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") return { handled: false, reason: "not-subscription" };

      const userId = session.client_reference_id || session.metadata?.user_id;
      const tier = session.metadata?.tier;
      if (!userId || !isValidTier(tier)) return { handled: false, reason: "missing-user-or-tier" };

      const patch = {
        ...accessPatchForTier(tier),
        stripe_customer_id: session.customer || null,
        stripe_subscription_id: session.subscription || null,
      };

      const { error } = await client
        .from("synapsys_access")
        .update(patch)
        .eq("user_id", userId)
        .eq("product_key", PRODUCT_KEY);

      if (error) throw new Error(`Falha ao atualizar acesso após checkout: ${error.message}`);
      return { handled: true, userId, tier };
    }

    // Cobrança recorrente confirmada (renovação) — reforça o tier, útil
    // caso o status tivesse caído por uma falha de pagamento anterior.
    case "invoice.paid": {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) return { handled: false, reason: "no-subscription" };

      const { data: row, error: findError } = await client
        .from("synapsys_access")
        .select("user_id, tier")
        .eq("stripe_subscription_id", subscriptionId)
        .eq("product_key", PRODUCT_KEY)
        .maybeSingle();

      if (findError || !row) return { handled: false, reason: "no-matching-row" };

      const { error } = await client
        .from("synapsys_access")
        .update({ status: "active" })
        .eq("user_id", row.user_id)
        .eq("product_key", PRODUCT_KEY);

      if (error) throw new Error(`Falha ao reativar acesso após pagamento: ${error.message}`);
      return { handled: true, userId: row.user_id };
    }

    // Pagamento falhou (cartão recusado, etc.) — marca como bloqueado.
    // Sem isso, alguém com o cartão recusado continuaria com acesso pago
    // de graça até o Stripe desistir de tentar cobrar de novo.
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) return { handled: false, reason: "no-subscription" };

      const { error } = await client
        .from("synapsys_access")
        .update({ status: "blocked" })
        .eq("stripe_subscription_id", subscriptionId)
        .eq("product_key", PRODUCT_KEY);

      if (error) throw new Error(`Falha ao marcar acesso como bloqueado: ${error.message}`);
      return { handled: true, subscriptionId };
    }

    // Assinatura cancelada (pelo cliente, ou pelo Stripe após esgotar as
    // tentativas de cobrança) — volta pro tier free, não deixa bloqueado
    // pra sempre (bloqueado é reservado pra ação manual/fraude).
    case "customer.subscription.deleted": {
      const subscription = event.data.object;

      const patch = {
        ...accessPatchForTier("free"),
        stripe_subscription_id: null,
      };

      const { error } = await client
        .from("synapsys_access")
        .update(patch)
        .eq("stripe_subscription_id", subscription.id)
        .eq("product_key", PRODUCT_KEY);

      if (error) throw new Error(`Falha ao rebaixar acesso após cancelamento: ${error.message}`);
      return { handled: true, subscriptionId: subscription.id };
    }

    default:
      return { handled: false, reason: "unhandled-event-type" };
  }
}

module.exports = {
  getStripe,
  isValidTier,
  isValidCycle,
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
};
