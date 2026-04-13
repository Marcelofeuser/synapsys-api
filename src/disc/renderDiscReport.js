const fs = require("fs");
const path = require("path");
const { buildDiscReportData, replaceAll } = require("./reportEngine");

async function renderDiscReport(payload = {}) {
  const templatePath = path.join(__dirname, "templates", "relatorio_disc.html");

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template HTML do relatório DISC não encontrado: ${templatePath}`);
  }

  const templateHtml = fs.readFileSync(templatePath, "utf8");
  const data = buildDiscReportData(payload);
  return replaceAll(templateHtml, data);
}

module.exports = {
  renderDiscReport,
};
