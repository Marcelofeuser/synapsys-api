const {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  buildSnippet,
  normalizeConversationFilter,
  sanitizeProjectColor,
  sanitizeProjectIcon,
} = require("./utils");

function unwrap(result, context) {
  if (result.error) {
    const error = new Error(`${context}: ${result.error.message}`);
    error.cause = result.error;
    throw error;
  }

  return result.data;
}

function mapProject(project, stats = {}) {
  return {
    id: project.id,
    name: project.name,
    description: project.description || "",
    color: project.color || DEFAULT_PROJECT_COLOR,
    icon: project.icon || DEFAULT_PROJECT_ICON,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    archivedAt: project.archived_at,
    conversationCount: stats.total || 0,
    activeConversationCount: stats.active || 0,
  };
}

function mapConversation(row, projectMap, countsMap) {
  return {
    id: row.id,
    title: row.title || "Novo cerebro",
    projectId: row.project_id || null,
    project: row.project_id ? projectMap.get(row.project_id) || null : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    lastOpenedAt: row.last_opened_at || row.updated_at,
    messageCount: countsMap.get(row.id) || 0,
  };
}

async function fetchProjectsMap(client, userId, projectIds) {
  if (!projectIds.length) {
    return new Map();
  }

  const rows = unwrap(
    await client
      .from("synapsys_projects")
      .select("id, name, description, color, icon, created_at, updated_at, archived_at")
      .eq("user_id", userId)
      .in("id", projectIds),
    "Falha ao buscar projetos vinculados"
  );

  const map = new Map();

  rows.forEach((row) => {
    map.set(row.id, mapProject(row));
  });

  return map;
}

async function fetchConversationCounts(client, conversationIds) {
  if (!conversationIds.length) {
    return new Map();
  }

  const rows = unwrap(
    await client
      .from("synapsys_conversation_messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds),
    "Falha ao buscar contagem de mensagens"
  );

  const counts = new Map();

  rows.forEach((row) => {
    counts.set(row.conversation_id, (counts.get(row.conversation_id) || 0) + 1);
  });

  return counts;
}

async function decorateConversations(client, userId, rows) {
  const conversationIds = rows.map((row) => row.id);
  const projectIds = [...new Set(rows.map((row) => row.project_id).filter(Boolean))];

  const [projectMap, countsMap] = await Promise.all([
    fetchProjectsMap(client, userId, projectIds),
    fetchConversationCounts(client, conversationIds),
  ]);

  return rows.map((row) => mapConversation(row, projectMap, countsMap));
}

async function listProjects(client, userId) {
  const [projects, conversations] = await Promise.all([
    unwrap(
      await client
        .from("synapsys_projects")
        .select("id, name, description, color, icon, created_at, updated_at, archived_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      "Falha ao listar projetos"
    ),
    unwrap(
      await client
        .from("synapsys_conversations")
        .select("id, project_id, archived_at")
        .eq("user_id", userId),
      "Falha ao contar conversas por projeto"
    ),
  ]);

  const statsByProject = new Map();

  conversations.forEach((conversation) => {
    if (!conversation.project_id) {
      return;
    }

    const current = statsByProject.get(conversation.project_id) || { total: 0, active: 0 };
    current.total += 1;
    if (!conversation.archived_at) {
      current.active += 1;
    }
    statsByProject.set(conversation.project_id, current);
  });

  return projects
    .map((project) => mapProject(project, statsByProject.get(project.id)))
    .sort((a, b) => {
      if (!!a.archivedAt !== !!b.archivedAt) {
        return a.archivedAt ? 1 : -1;
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

async function assertOwnedProject(client, userId, projectId) {
  if (!projectId) {
    return null;
  }

  const project = unwrap(
    await client
      .from("synapsys_projects")
      .select("id, name, description, color, icon, created_at, updated_at, archived_at")
      .eq("user_id", userId)
      .eq("id", projectId)
      .maybeSingle(),
    "Falha ao validar projeto"
  );

  if (!project) {
    const error = new Error("Projeto nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return mapProject(project);
}

async function createProject(client, userId, payload) {
  const project = unwrap(
    await client
      .from("synapsys_projects")
      .insert({
        user_id: userId,
        name: String(payload.name || "").trim(),
        description: String(payload.description || "").trim() || null,
        color: sanitizeProjectColor(payload.color),
        icon: sanitizeProjectIcon(payload.icon),
      })
      .select("id, name, description, color, icon, created_at, updated_at, archived_at")
      .single(),
    "Falha ao criar projeto"
  );

  return mapProject(project);
}

async function updateProject(client, userId, projectId, payload) {
  await assertOwnedProject(client, userId, projectId);

  const updates = {};

  if (payload.name !== undefined) {
    updates.name = String(payload.name || "").trim();
  }

  if (payload.description !== undefined) {
    updates.description = String(payload.description || "").trim() || null;
  }

  if (payload.color !== undefined) {
    updates.color = sanitizeProjectColor(payload.color);
  }

  if (payload.icon !== undefined) {
    updates.icon = sanitizeProjectIcon(payload.icon);
  }

  if (payload.archivedAt !== undefined) {
    updates.archived_at = payload.archivedAt;
  }

  const updated = unwrap(
    await client
      .from("synapsys_projects")
      .update(updates)
      .eq("user_id", userId)
      .eq("id", projectId)
      .select("id, name, description, color, icon, created_at, updated_at, archived_at")
      .single(),
    "Falha ao atualizar projeto"
  );

  return mapProject(updated);
}

async function deleteProject(client, userId, projectId) {
  await assertOwnedProject(client, userId, projectId);

  unwrap(
    await client
      .from("synapsys_conversations")
      .update({ project_id: null })
      .eq("user_id", userId)
      .eq("project_id", projectId),
    "Falha ao desvincular conversas do projeto"
  );

  unwrap(
    await client
      .from("synapsys_projects")
      .delete()
      .eq("user_id", userId)
      .eq("id", projectId),
    "Falha ao excluir projeto"
  );
}

async function listConversations(client, userId, options = {}) {
  const filter = normalizeConversationFilter(options.filter);
  const limit = options.limit || 100;
  const rangeStart = options.rangeStart;

  let query = client
    .from("synapsys_conversations")
    .select("id, title, project_id, created_at, updated_at, archived_at, last_opened_at")
    .eq("user_id", userId);

  if (filter === "archived") {
    query = query.not("archived_at", "is", null);
  } else if (filter !== "all") {
    query = query.is("archived_at", null);
  }

  if (rangeStart) {
    query = query.gte("updated_at", rangeStart);
  }

  if (options.projectId) {
    query = query.eq("project_id", options.projectId);
  }

  const rows = unwrap(
    await query.order("updated_at", { ascending: false }).limit(limit),
    "Falha ao listar conversas"
  );

  return decorateConversations(client, userId, rows);
}

async function getConversation(client, userId, conversationId, options = {}) {
  const conversation = unwrap(
    await client
      .from("synapsys_conversations")
      .select("id, title, project_id, created_at, updated_at, archived_at, last_opened_at")
      .eq("user_id", userId)
      .eq("id", conversationId)
      .maybeSingle(),
    "Falha ao buscar conversa"
  );

  if (!conversation) {
    const error = new Error("Conversa nao encontrada.");
    error.statusCode = 404;
    throw error;
  }

  if (options.markOpened) {
    unwrap(
      await client
        .from("synapsys_conversations")
        .update({ last_opened_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", conversationId),
      "Falha ao registrar ultima abertura da conversa"
    );
    conversation.last_opened_at = new Date().toISOString();
  }

  const [messages, decorated] = await Promise.all([
    unwrap(
      await client
        .from("synapsys_conversation_messages")
        .select("id, conversation_id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }),
      "Falha ao listar mensagens da conversa"
    ),
    decorateConversations(client, userId, [conversation]),
  ]);

  return {
    ...decorated[0],
    messages: messages.map((message) => ({
      id: message.id,
      conversationId: message.conversation_id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    })),
  };
}

async function createConversation(client, userId, payload) {
  if (payload.projectId) {
    await assertOwnedProject(client, userId, payload.projectId);
  }

  const inserted = unwrap(
    await client
      .from("synapsys_conversations")
      .insert({
        user_id: userId,
        title: payload.title,
        project_id: payload.projectId || null,
        last_opened_at: new Date().toISOString(),
      })
      .select("id, title, project_id, created_at, updated_at, archived_at, last_opened_at")
      .single(),
    "Falha ao criar conversa"
  );

  const [decorated] = await decorateConversations(client, userId, [inserted]);
  return decorated;
}

async function updateConversation(client, userId, conversationId, payload) {
  if (payload.projectId !== undefined && payload.projectId !== null) {
    await assertOwnedProject(client, userId, payload.projectId);
  }

  const updates = {};

  if (payload.title !== undefined) {
    updates.title = payload.title;
  }

  if (payload.projectId !== undefined) {
    updates.project_id = payload.projectId || null;
  }

  if (payload.archivedAt !== undefined) {
    updates.archived_at = payload.archivedAt;
  }

  if (payload.lastOpenedAt !== undefined) {
    updates.last_opened_at = payload.lastOpenedAt;
  }

  const updated = unwrap(
    await client
      .from("synapsys_conversations")
      .update(updates)
      .eq("user_id", userId)
      .eq("id", conversationId)
      .select("id, title, project_id, created_at, updated_at, archived_at, last_opened_at")
      .single(),
    "Falha ao atualizar conversa"
  );

  const [decorated] = await decorateConversations(client, userId, [updated]);
  return decorated;
}

async function deleteConversation(client, userId, conversationId) {
  unwrap(
    await client
      .from("synapsys_conversations")
      .delete()
      .eq("user_id", userId)
      .eq("id", conversationId),
    "Falha ao excluir conversa"
  );
}

async function addConversationMessage(client, conversationId, role, content) {
  const message = unwrap(
    await client
      .from("synapsys_conversation_messages")
      .insert({
        conversation_id: conversationId,
        role,
        content,
      })
      .select("id, conversation_id, role, content, created_at")
      .single(),
    "Falha ao salvar mensagem"
  );

  return {
    id: message.id,
    conversationId: message.conversation_id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
  };
}

async function listRecentConversations(client, userId, limit = 10) {
  const rows = await listConversations(client, userId, { filter: "all", limit: Math.max(limit * 3, 30) });

  return rows
    .filter((row) => !row.archivedAt)
    .sort((a, b) => {
      const left = new Date(a.lastOpenedAt || a.updatedAt).getTime();
      const right = new Date(b.lastOpenedAt || b.updatedAt).getTime();
      return right - left;
    })
    .slice(0, limit);
}

async function searchWorkspace(client, userId, options = {}) {
  const term = String(options.term || "").trim();

  if (!term) {
    return [];
  }

  const conversations = await listConversations(client, userId, {
    filter: options.filter,
    rangeStart: options.rangeStart,
    projectId: options.projectId,
    limit: 200,
  });

  if (!conversations.length) {
    return [];
  }

  const needle = term.toLowerCase();
  const conversationMap = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const results = [];

  conversations.forEach((conversation) => {
    if (conversation.title.toLowerCase().includes(needle)) {
      results.push({
        id: `title:${conversation.id}`,
        type: "title",
        conversationId: conversation.id,
        title: conversation.title,
        snippet: buildSnippet(conversation.title, term, 120),
        date: conversation.updatedAt,
        project: conversation.project,
      });
    }

    const projectName = conversation.project?.name || "";
    if (projectName && projectName.toLowerCase().includes(needle)) {
      results.push({
        id: `project:${conversation.id}`,
        type: "project",
        conversationId: conversation.id,
        title: conversation.title,
        snippet: `Projeto: ${projectName}`,
        date: conversation.updatedAt,
        project: conversation.project,
      });
    }
  });

  const messageRows = unwrap(
    await client
      .from("synapsys_conversation_messages")
      .select("id, conversation_id, role, content, created_at")
      .in(
        "conversation_id",
        conversations.map((conversation) => conversation.id)
      )
      .ilike("content", `%${term}%`)
      .order("created_at", { ascending: false })
      .limit((options.limit || 30) * 4),
    "Falha ao buscar mensagens da pesquisa"
  );

  messageRows.forEach((message) => {
    const conversation = conversationMap.get(message.conversation_id);

    if (!conversation) {
      return;
    }

    results.push({
      id: `message:${message.id}`,
      type: "message",
      conversationId: conversation.id,
      title: conversation.title,
      snippet: buildSnippet(message.content, term),
      date: message.created_at,
      project: conversation.project,
      role: message.role,
    });
  });

  return results
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, options.limit || 30);
}

function isMissingSynapsysTableError(error) {
  const message = String(error?.cause?.message || error?.message || "").toLowerCase();
  return (
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("could not find the table") && message.includes("synapsys_"))
  );
}

module.exports = {
  addConversationMessage,
  assertOwnedProject,
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
};
