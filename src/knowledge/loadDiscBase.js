const fs = require("fs");
const path = require("path");

function loadDiscBase() {
  const filePath = path.join(__dirname, "../../knowledge/disc/disc-base.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

module.exports = { loadDiscBase };