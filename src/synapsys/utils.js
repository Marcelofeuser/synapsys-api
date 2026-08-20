const DEFAULT_PROJECT_COLOR = "#50c8ff";
const DEFAULT_PROJECT_ICON = "folder";

function normalizeConversationFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "today" || normalized === "hoje") return "today";
  if (normalized === "7d" || normalized === "7dias" || normalized === "7") return "7d";
  if (normalized === "30d" || normalized === "30dias" || normalized === "30") return "30d";
  if (normalized === "archived" || normalized === "arquivadas") return "archived";
  if (normalized === "all" || normalized === "todas") return "all";

  return "30d";
}

function getRangeStart(filter, now = new Date()) {
  const normalized = normalizeConversationFilter(filter);

  if (normalized === "all" || normalized === "archived") {
    return null;
  }

  const start = new Date(now);
  start.setMilliseconds(0);

  if (normalized === "today") {
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }

  const days = normalized === "7d" ? 7 : 30;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return start.toISOString();
}

function buildConversationTitle(input) {
  const cleaned = String(input || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "Novo cerebro";
  }

  if (cleaned.length <= 72) {
    return cleaned;
  }

  return `${cleaned.slice(0, 69).trimEnd()}...`;
}

function buildSnippet(content, term, maxLength = 160) {
  const plain = String(content || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) {
    return "";
  }

  const needle = String(term || "").trim().toLowerCase();

  if (!needle) {
    return plain.length <= maxLength ? plain : `${plain.slice(0, maxLength - 3).trimEnd()}...`;
  }

  const matchIndex = plain.toLowerCase().indexOf(needle);

  if (matchIndex === -1 || plain.length <= maxLength) {
    return plain.length <= maxLength ? plain : `${plain.slice(0, maxLength - 3).trimEnd()}...`;
  }

  const focusPadding = Math.max(18, Math.floor((maxLength - needle.length) / 2));
  const start = Math.max(0, matchIndex - focusPadding);
  const end = Math.min(plain.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < plain.length ? "..." : "";

  return `${prefix}${plain.slice(start, end).trim()}${suffix}`;
}

function sanitizeProjectColor(color) {
  const normalized = String(color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : DEFAULT_PROJECT_COLOR;
}

function sanitizeProjectIcon(icon) {
  const normalized = String(icon || "").trim().toLowerCase();
  return normalized || DEFAULT_PROJECT_ICON;
}

function toPositiveInteger(value, fallback = 10, max = 100) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

module.exports = {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  buildConversationTitle,
  buildSnippet,
  getRangeStart,
  normalizeConversationFilter,
  sanitizeProjectColor,
  sanitizeProjectIcon,
  toPositiveInteger,
};
