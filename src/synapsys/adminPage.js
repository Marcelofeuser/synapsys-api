// Página do super admin — servida direto pelo backend (sem depender do
// repo do frontend React). Autocontida: HTML + CSS + JS num arquivo só,
// sem build step. Login por senha reaproveita o /superadmin/login que já
// existia (ADMIN_PASSWORD), e as ações de usuário chamam as novas rotas
// /superadmin/api/users.
function renderAdminPage() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Synapsys — Super Admin</title>
<style>
  :root {
    --bg: #0b0e14;
    --panel: #131722;
    --panel-2: #1a1f2e;
    --border: #262c3d;
    --text: #e6e9f0;
    --muted: #8a91a8;
    --accent: #7c5cff;
    --accent-2: #5cd3ff;
    --danger: #ff5c7a;
    --ok: #4ade80;
    --warn: #fbbf24;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
  }
  header h1 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  header h1 .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); display: inline-block; }
  header .actions { display: flex; gap: 8px; align-items: center; }
  button {
    font: inherit;
    cursor: pointer;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--text);
    padding: 8px 14px;
    transition: border-color .15s, background .15s;
  }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.primary:hover { background: #6a4bea; }
  button.ghost { background: transparent; }
  button.small { padding: 4px 8px; font-size: 12px; }
  button:disabled { opacity: .5; cursor: not-allowed; }

  #login-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 60px);
  }
  .login-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 32px;
    width: min(360px, 90vw);
  }
  .login-card h2 { margin: 0 0 4px; font-size: 18px; }
  .login-card p { margin: 0 0 20px; color: var(--muted); font-size: 13px; }
  .login-card input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--text);
    font-size: 14px;
    margin-bottom: 12px;
  }
  .login-card button { width: 100%; padding: 10px; font-size: 14px; }
  .login-error { color: var(--danger); font-size: 13px; margin-top: 8px; min-height: 16px; }

  main { padding: 20px 24px 60px; max-width: 1400px; margin: 0 auto; }
  .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .toolbar input[type="search"] {
    flex: 1;
    min-width: 200px;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--text);
    font-size: 13px;
  }
  .toolbar .count { color: var(--muted); font-size: 13px; white-space: nowrap; }

  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
  table { border-collapse: collapse; width: 100%; min-width: 1100px; font-size: 13px; }
  thead th {
    text-align: left;
    padding: 10px 12px;
    color: var(--muted);
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .04em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: rgba(255,255,255,.02); }
  .user-email { font-weight: 500; }
  .user-name { color: var(--muted); font-size: 12px; }
  .user-meta { color: var(--muted); font-size: 11px; margin-top: 2px; }
  select, .num-input {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 5px 6px;
    font-size: 12px;
    font: inherit;
  }
  .num-input { width: 60px; }
  .model-cell { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .model-used { color: var(--muted); font-size: 11px; }
  .reset-btn { border: none; background: transparent; color: var(--muted); padding: 2px 4px; font-size: 12px; }
  .reset-btn:hover { color: var(--accent-2); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.active { background: rgba(74,222,128,.15); color: var(--ok); }
  .badge.trial { background: rgba(251,191,36,.15); color: var(--warn); }
  .badge.blocked, .badge.canceled { background: rgba(255,92,122,.15); color: var(--danger); }
  .badge.none { background: rgba(138,145,168,.15); color: var(--muted); }
  .save-btn { min-width: 66px; }
  .save-btn.dirty { border-color: var(--accent-2); }
  .row-msg { font-size: 11px; margin-top: 4px; min-height: 14px; }
  .row-msg.ok { color: var(--ok); }
  .row-msg.err { color: var(--danger); }
  .empty-state, .loading-state { text-align: center; padding: 60px 20px; color: var(--muted); }
  .toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 13px;
    max-width: 320px;
    display: none;
  }
</style>
</head>
<body>

<div id="login-screen">
  <div class="login-card">
    <h2>Synapsys — Super Admin</h2>
    <p>Área restrita. Entre com a senha de administrador.</p>
    <input type="password" id="login-password" placeholder="Senha" autofocus />
    <button class="primary" id="login-submit">Entrar</button>
    <div class="login-error" id="login-error"></div>
  </div>
</div>

<div id="app-screen" style="display:none">
  <header>
    <h1><span class="dot"></span> Synapsys — Super Admin</h1>
    <div class="actions">
      <button class="ghost small" id="refresh-btn">Atualizar</button>
      <button class="ghost small" id="logout-btn">Sair</button>
    </div>
  </header>
  <main>
    <div class="toolbar">
      <input type="search" id="search-input" placeholder="Buscar por e-mail ou nome..." />
      <span class="count" id="user-count"></span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Sol (mensal)</th>
            <th>Terra (dia)</th>
            <th>Luna (dia)</th>
            <th>Stripe</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="users-tbody"></tbody>
      </table>
      <div class="loading-state" id="loading-state">Carregando usuários...</div>
      <div class="empty-state" id="empty-state" style="display:none">Nenhum usuário encontrado.</div>
    </div>
  </main>
</div>

<div class="toast" id="toast"></div>

<script>
(function () {
  "use strict";

  var TOKEN_KEY = "synapsys_admin_token";
  var state = { users: [], filter: "" };

  var loginScreen = document.getElementById("login-screen");
  var appScreen = document.getElementById("app-screen");
  var loginPassword = document.getElementById("login-password");
  var loginSubmit = document.getElementById("login-submit");
  var loginError = document.getElementById("login-error");
  var tbody = document.getElementById("users-tbody");
  var loadingState = document.getElementById("loading-state");
  var emptyState = document.getElementById("empty-state");
  var userCount = document.getElementById("user-count");
  var searchInput = document.getElementById("search-input");
  var toast = document.getElementById("toast");

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = "block";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.style.display = "none"; }, 3000);
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, {
      "Content-Type": "application/json",
      "x-admin-token": getToken(),
    });
    return fetch(path, options).then(function (res) {
      if (res.status === 401) {
        setToken("");
        showLogin("Sessão expirada. Entre novamente.");
        throw new Error("unauthorized");
      }
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || ("Erro " + res.status));
        return body;
      });
    });
  }

  function showLogin(err) {
    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
    loginError.textContent = err || "";
    loginPassword.value = "";
    loginPassword.focus();
  }

  function showApp() {
    loginScreen.style.display = "none";
    appScreen.style.display = "block";
    loadUsers();
  }

  loginSubmit.addEventListener("click", doLogin);
  loginPassword.addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });

  function doLogin() {
    var password = loginPassword.value;
    if (!password) return;
    loginSubmit.disabled = true;
    loginError.textContent = "";
    fetch("/superadmin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password }),
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        loginSubmit.disabled = false;
        if (!r.ok) { loginError.textContent = r.body.error || "Senha incorreta."; return; }
        setToken(r.body.token);
        showApp();
      })
      .catch(function () {
        loginSubmit.disabled = false;
        loginError.textContent = "Não foi possível conectar ao servidor.";
      });
  }

  document.getElementById("logout-btn").addEventListener("click", function () {
    api("/superadmin/logout", { method: "POST" }).catch(function () {}).then(function () {
      setToken("");
      showLogin();
    });
  });

  document.getElementById("refresh-btn").addEventListener("click", loadUsers);
  searchInput.addEventListener("input", function () {
    state.filter = searchInput.value.trim().toLowerCase();
    renderUsers();
  });

  var TIERS = ["free", "sinapse", "cortex", "rede"];
  var STATUSES = ["trial", "active", "blocked", "canceled"];

  function loadUsers() {
    loadingState.style.display = "block";
    emptyState.style.display = "none";
    tbody.innerHTML = "";
    api("/superadmin/api/users")
      .then(function (body) {
        state.users = body.items || [];
        renderUsers();
      })
      .catch(function (err) {
        if (err.message !== "unauthorized") showToast("Falha ao carregar usuários: " + err.message);
      })
      .finally(function () { loadingState.style.display = "none"; });
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function optionsHtml(list, current) {
    return list.map(function (v) {
      return '<option value="' + v + '"' + (v === current ? " selected" : "") + ">" + v + "</option>";
    }).join("");
  }

  function renderUsers() {
    var filtered = state.users.filter(function (u) {
      if (!state.filter) return true;
      return (u.email || "").toLowerCase().indexOf(state.filter) !== -1 ||
        (u.name || "").toLowerCase().indexOf(state.filter) !== -1;
    });

    userCount.textContent = filtered.length + " de " + state.users.length + " usuário(s)";
    emptyState.style.display = filtered.length ? "none" : "block";

    tbody.innerHTML = filtered.map(function (u) {
      var tier = u.tier || "free";
      var status = u.status || "active";
      var statusBadgeClass = u.hasAccess ? status : "none";
      var statusBadgeLabel = u.hasAccess ? status : "sem acesso";

      return (
        '<tr data-user-id="' + u.userId + '">' +
          '<td>' +
            '<div class="user-email">' + escapeHtml(u.email) + '</div>' +
            (u.name ? '<div class="user-name">' + escapeHtml(u.name) + '</div>' : "") +
            '<div class="user-meta">criado em ' + fmtDate(u.createdAt) + '</div>' +
          '</td>' +
          '<td><select class="tier-select">' + optionsHtml(TIERS, tier) + '</select></td>' +
          '<td>' +
            '<select class="status-select">' + optionsHtml(STATUSES, status) + '</select> ' +
            '<span class="badge ' + statusBadgeClass + '">' + statusBadgeLabel + '</span>' +
          '</td>' +
          modelCell("sol", u.sol) +
          modelCell("terra", u.terra) +
          modelCell("luna", u.luna) +
          '<td class="user-meta">' + (u.stripeCustomerId ? escapeHtml(u.stripeCustomerId) : "—") + '</td>' +
          '<td>' +
            '<button class="primary small save-btn">Salvar</button>' +
            '<div class="row-msg"></div>' +
          '</td>' +
        '</tr>'
      );
    }).join("");

    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), wireRow);
  }

  function modelCell(key, data) {
    var limit = data && data.limit != null ? data.limit : "";
    var used = data ? data.used : 0;
    return (
      '<td>' +
        '<div class="model-cell">' +
          '<input class="num-input ' + key + '-limit" type="number" min="0" value="' + limit + '" placeholder="∞" />' +
          '<span class="model-used">usado: ' + used + '</span>' +
          '<button class="reset-btn ' + key + '-reset" title="Zerar uso">⟲</button>' +
        '</div>' +
      '</td>'
    );
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function wireRow(tr) {
    var userId = tr.getAttribute("data-user-id");
    var saveBtn = tr.querySelector(".save-btn");
    var rowMsg = tr.querySelector(".row-msg");

    saveBtn.addEventListener("click", function () {
      var patch = {
        tier: tr.querySelector(".tier-select").value,
        status: tr.querySelector(".status-select").value,
        solLimit: readNum(tr.querySelector(".sol-limit")),
        terraLimit: readNum(tr.querySelector(".terra-limit")),
        lunaLimit: readNum(tr.querySelector(".luna-limit")),
      };
      saveBtn.disabled = true;
      rowMsg.textContent = "Salvando...";
      rowMsg.className = "row-msg";
      api("/superadmin/api/users/" + userId, { method: "PATCH", body: JSON.stringify(patch) })
        .then(function () {
          rowMsg.textContent = "Salvo ✓";
          rowMsg.className = "row-msg ok";
          loadUsers();
        })
        .catch(function (err) {
          if (err.message === "unauthorized") return;
          rowMsg.textContent = err.message;
          rowMsg.className = "row-msg err";
        })
        .finally(function () { saveBtn.disabled = false; });
    });

    ["sol", "terra", "luna"].forEach(function (key) {
      var resetBtn = tr.querySelector("." + key + "-reset");
      resetBtn.addEventListener("click", function () {
        var patch = {};
        patch["reset" + key.charAt(0).toUpperCase() + key.slice(1) + "Usage"] = true;
        resetBtn.disabled = true;
        api("/superadmin/api/users/" + userId, { method: "PATCH", body: JSON.stringify(patch) })
          .then(function () { showToast("Uso de " + key + " zerado."); loadUsers(); })
          .catch(function (err) { if (err.message !== "unauthorized") showToast("Falha: " + err.message); })
          .finally(function () { resetBtn.disabled = false; });
      });
    });
  }

  function readNum(input) {
    var v = input.value.trim();
    return v === "" ? null : Number(v);
  }

  // ─── Boot ───
  if (getToken()) {
    showApp();
  } else {
    showLogin();
  }
})();
</script>
</body>
</html>`;
}

module.exports = { renderAdminPage };
