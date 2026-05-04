const state = {
  journals: [],
  preloadedAbdc: [],
  preloadedAbs: [],
  preloadedJcr: [],
  preloadedSjr: [],
  consideredSjr: [],
  imports: {
    abs: [],
    jcr: [],
    sjr: []
  },
  indexes: {
    abs: null,
    jcr: null,
    sjr: null
  },
  sort: { key: "title", direction: "asc" }
};

const FOR_LABELS = {
  3501: "Accounting, auditing and accountability",
  3502: "Banking, finance and investment",
  3503: "Business systems in context",
  3504: "Commercial services",
  3505: "Human resources and industrial relations",
  3506: "Marketing",
  3507: "Strategy, management and organisational behaviour",
  3508: "Tourism",
  3509: "Transportation, logistics and supply chains",
  3599: "Other commerce, management, tourism and services",
  3801: "Applied economics",
  3802: "Econometrics",
  3803: "Economic theory",
  3899: "Other economics",
  4609: "Information systems",
  4801: "Commercial law",
  4905: "Statistics"
};

const els = {
  rows: document.getElementById("journalRows"),
  search: document.getElementById("searchInput"),
  abdc: document.getElementById("abdcFilter"),
  field: document.getElementById("fieldFilter"),
  coverage: document.getElementById("coverageFilter"),
  reset: document.getElementById("resetButton"),
  recordCount: document.getElementById("recordCount"),
  visibleCount: document.getElementById("visibleCount"),
  absCount: document.getElementById("absCount"),
  jcrCount: document.getElementById("jcrCount"),
  sjrCount: document.getElementById("sjrCount"),
  absFile: document.getElementById("absFile"),
  jcrFile: document.getElementById("jcrFile"),
  sjrFile: document.getElementById("sjrFile"),
  clearImports: document.getElementById("clearImportsButton"),
  importStatus: document.getElementById("importStatus")
};

init();

async function init() {
  restoreImports();
  const [abdcPayload, absPayload, jcrPayload, sjrPayload] = await Promise.all([
    fetch("data/abdc-2025.json").then((response) => response.json()),
    fetch("data/abs-ajg-2024.json").then((response) => response.ok ? response.json() : { records: [] }).catch(() => ({ records: [] })),
    fetch("data/jcr-2025.json").then((response) => response.ok ? response.json() : { records: [] }).catch(() => ({ records: [] })),
    fetch("data/sjr-2025.json").then((response) => response.ok ? response.json() : { records: [] }).catch(() => ({ records: [] }))
  ]);
  const payload = abdcPayload;
  state.preloadedAbdc = payload.records.map(normalizeAbdcRecord);
  state.preloadedAbs = absPayload.records.map(normalizeAbsRecord);
  state.preloadedJcr = jcrPayload.records.map(normalizeJcrRecord);
  state.preloadedSjr = sjrPayload.records.map(normalizeSjrRecord);
  rebuildIndexes();

  els.recordCount.textContent = `${state.journals.length.toLocaleString()} journals; ${state.preloadedAbdc.length.toLocaleString()} ABDC journals; ${state.preloadedAbs.length.toLocaleString()} ABS rows; ${state.preloadedJcr.length.toLocaleString()} JCR rows; ${state.consideredSjr.length.toLocaleString()} JCR-matched SJR rows`;
  fillFilters();
  bindEvents();
  render();
}

function bindEvents() {
  [els.search, els.abdc, els.field, els.coverage].forEach((el) => {
    el.addEventListener("input", render);
  });

  els.reset.addEventListener("click", () => {
    els.search.value = "";
    els.abdc.value = "";
    els.field.value = "";
    els.coverage.value = "";
    state.sort = { key: "title", direction: "asc" };
    render();
  });

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      state.sort = {
        key,
        direction: state.sort.key === key && state.sort.direction === "asc" ? "desc" : "asc"
      };
      render();
    });
  });

  els.absFile.addEventListener("change", (event) => importCsv(event, "abs"));
  els.jcrFile.addEventListener("change", (event) => importCsv(event, "jcr"));
  els.sjrFile.addEventListener("change", (event) => importCsv(event, "sjr"));

  els.clearImports.addEventListener("click", () => {
    state.imports = { abs: [], jcr: [], sjr: [] };
    localStorage.removeItem("journalRankingImports");
    els.importStatus.textContent = "Imported rankings cleared.";
    rebuildIndexes();
    render();
  });
}

function fillFilters() {
  const abdcValues = [...new Set(state.journals.map((j) => j.abdc2025).filter(Boolean))]
    .sort(sortRankValue);
  const fieldValues = [...new Set(state.journals.map((j) => j.fieldOfResearch).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  fillSelect(els.abdc, abdcValues);
  fillSelect(els.field, fieldValues, getForLabel);
}

function fillSelect(select, values, labeler = (value) => value) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.appendChild(option);
  });
}

function render() {
  const merged = state.journals.map(mergeRankings);
  const filtered = applyFilters(merged).sort(compareRows);

  els.visibleCount.textContent = filtered.length.toLocaleString();
  els.absCount.textContent = merged.filter((row) => row.abs.length).length.toLocaleString();
  els.jcrCount.textContent = merged.filter((row) => row.jcr.length).length.toLocaleString();
  els.sjrCount.textContent = merged.filter((row) => row.sjr.length).length.toLocaleString();

  els.rows.replaceChildren(...filtered.slice(0, 800).map(renderRow));
  if (filtered.length > 800) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "subtle";
    td.textContent = `Showing first 800 rows. Narrow the search to see more targeted results.`;
    tr.appendChild(td);
    els.rows.appendChild(tr);
  }
}

function applyFilters(rows) {
  const query = normalizeText(els.search.value);
  const abdc = els.abdc.value;
  const field = els.field.value;
  const coverage = els.coverage.value;

  return rows.filter((row) => {
    if (abdc && row.abdc2025 !== abdc) return false;
    if (field && row.fieldOfResearch !== field) return false;
    if (coverage === "abs" && !row.abs.length) return false;
    if (coverage === "jcr" && !row.jcr.length) return false;
    if (coverage === "sjr" && !row.sjr.length) return false;
    if (coverage === "missing" && row.abs.length && row.jcr.length && row.sjr.length) return false;
    if (!query) return true;
    return row.searchText.includes(query);
  });
}

function mergeRankings(journal) {
  const abs = findMatches(journal, "abs");
  const jcr = findMatches(journal, "jcr");
  const sjr = findMatches(journal, "sjr");
  return {
    ...journal,
    abs,
    jcr,
    sjr,
    absText: abs.map((x) => [x.rating, x.field].filter(Boolean).join(" ")).join(" "),
    jcrAis: jcr.map((x) => x.ais).filter(Boolean).join("; "),
    sjrQuartiles: sjr.map((x) => [x.field, x.quartile].filter(Boolean).join(" ")).join("; "),
    searchText: normalizeText([
      journal.title,
      journal.publisher,
      journal.issn,
      journal.eissn,
      journal.fieldOfResearch,
      journal.fieldOfResearchLabel,
      journal.abdc2025,
      abs.map((x) => Object.values(x).join(" ")).join(" "),
      jcr.map((x) => Object.values(x).join(" ")).join(" "),
      sjr.map((x) => Object.values(x).join(" ")).join(" ")
    ].join(" "))
  };
}

function findMatches(journal, type) {
  const index = state.indexes[type];
  if (!index) return [];

  const seen = new Set();
  const matches = [];
  journal.keys.issns.forEach((issn) => addIndexedMatches(index.issn.get(issn), matches, seen));
  addIndexedMatches(index.title.get(journal.keys.title), matches, seen);
  return matches;
}

function addIndexedMatches(items, matches, seen) {
  if (!items) return;
  items.forEach((item) => {
    if (seen.has(item._id)) return;
    seen.add(item._id);
    matches.push(item);
  });
}

function rebuildIndexes() {
  const jcrRows = [...state.preloadedJcr, ...state.imports.jcr];
  const sjrRows = filterSjrRowsToJcr([...state.preloadedSjr, ...state.imports.sjr], jcrRows);
  state.consideredSjr = sjrRows;
  state.indexes = {
    abs: buildRankingIndex([...state.preloadedAbs, ...state.imports.abs], "abs"),
    jcr: buildRankingIndex(jcrRows, "jcr"),
    sjr: buildRankingIndex(sjrRows, "sjr")
  };
  state.journals = buildJournalMasterList();
}

function filterSjrRowsToJcr(sjrRows, jcrRows) {
  const jcrKeys = buildJcrEligibilityKeys(jcrRows);
  return sjrRows.filter((row) => hasJcrEligibilityMatch(row, jcrKeys));
}

function buildJcrEligibilityKeys(rows) {
  const keys = {
    issns: new Set(),
    titles: new Set()
  };

  rows.forEach((row) => {
    [
      ...(Array.isArray(row.issns) ? row.issns : []),
      row.issn,
      row.eissn
    ].map(normalizeIssn).filter(Boolean).forEach((issn) => keys.issns.add(issn));

    const titleKey = row.titleKey || normalizeTitle(row.title);
    if (titleKey) keys.titles.add(titleKey);
  });

  return keys;
}

function hasJcrEligibilityMatch(row, keys) {
  const issns = [
    ...(Array.isArray(row.issns) ? row.issns : []),
    row.issn,
    row.eissn
  ].map(normalizeIssn).filter(Boolean);
  if (issns.some((issn) => keys.issns.has(issn))) return true;

  const titleKey = row.titleKey || normalizeTitle(row.title);
  return Boolean(titleKey && keys.titles.has(titleKey));
}

function buildJournalMasterList() {
  const rows = [];
  const byIssn = new Map();
  const byTitle = new Map();

  [
    ...state.preloadedAbdc.map((row) => toMasterCandidate(row, "abdc")),
    ...state.consideredSjr.map((row) => toMasterCandidate(row, "sjr")),
    ...state.preloadedAbs.map((row) => toMasterCandidate(row, "abs")),
    ...state.preloadedJcr.map((row) => toMasterCandidate(row, "jcr")),
    ...state.imports.abs.map((row) => toMasterCandidate(row, "abs")),
    ...state.imports.jcr.map((row) => toMasterCandidate(row, "jcr"))
  ].forEach((candidate) => {
    if (!candidate.keys.title && !candidate.keys.issns.size) return;

    const existing = findMasterRow(candidate, byIssn, byTitle);
    if (existing) {
      mergeMasterRow(existing, candidate);
    } else {
      rows.push(candidate);
    }
    indexMasterRow(existing || candidate, byIssn, byTitle);
  });

  return rows.map((journal, index) => ({
    ...journal,
    id: index,
    fieldOfResearchLabel: getForLabel(journal.fieldOfResearch),
    keys: buildKeys(journal)
  }));
}

function toMasterCandidate(row, source) {
  const issns = new Set([
    ...(Array.isArray(row.issns) ? row.issns : []),
    row.issn,
    row.eissn
  ].map(normalizeIssn).filter(Boolean));
  const title = row.title || "";
  return {
    title,
    publisher: row.publisher || "",
    issn: normalizeIssn(row.issn) || [...issns][0] || "",
    eissn: normalizeIssn(row.eissn),
    issns: [...issns],
    fieldOfResearch: row.fieldOfResearch || "",
    fieldOfResearchLabel: getForLabel(row.fieldOfResearch),
    abdc2025: row.abdc2025 || "",
    yearInception: row.yearInception || "",
    titleSource: source,
    keys: {
      title: normalizeTitle(title),
      issns
    }
  };
}

function findMasterRow(candidate, byIssn, byTitle) {
  for (const issn of candidate.keys.issns) {
    if (byIssn.has(issn)) return byIssn.get(issn);
  }
  return byTitle.get(candidate.keys.title) || null;
}

function indexMasterRow(row, byIssn, byTitle) {
  row.keys.issns.forEach((issn) => byIssn.set(issn, row));
  if (row.keys.title) byTitle.set(row.keys.title, row);
}

function mergeMasterRow(target, source) {
  if (!target.abdc2025 && source.abdc2025) {
    target.abdc2025 = source.abdc2025;
    target.fieldOfResearch = source.fieldOfResearch;
    target.yearInception = source.yearInception;
  }
  if (!target.publisher && source.publisher) target.publisher = source.publisher;
  if (!target.issn && source.issn) target.issn = source.issn;
  if (!target.eissn && source.eissn) target.eissn = source.eissn;
  source.keys.issns.forEach((issn) => target.keys.issns.add(issn));
  target.issns = [...target.keys.issns];

  if (!target.title || shouldReplaceTitle(target.title, target.titleSource, source.title, source.titleSource)) {
    target.title = source.title;
    target.titleSource = source.titleSource;
    target.keys.title = source.keys.title;
  }
}

function shouldReplaceTitle(currentTitle, currentSource, nextTitle, nextSource) {
  if (!nextTitle) return false;
  if (!currentTitle) return true;

  const priority = { abdc: 4, sjr: 3, abs: 2, jcr: 1 };
  const currentPriority = priority[currentSource] || 0;
  const nextPriority = priority[nextSource] || 0;
  const currentLooksUpper = currentTitle === currentTitle.toUpperCase();
  const nextLooksUpper = nextTitle === nextTitle.toUpperCase();

  if (currentLooksUpper && !nextLooksUpper) return true;
  return nextPriority > currentPriority;
}

function buildRankingIndex(rows, type) {
  const index = {
    issn: new Map(),
    title: new Map()
  };

  rows.forEach((row, position) => {
    const item = {
      ...row,
      _id: `${type}-${position}`
    };
    const issns = new Set([
      ...(Array.isArray(item.issns) ? item.issns : []),
      item.issn,
      item.eissn
    ].map(normalizeIssn).filter(Boolean));

    issns.forEach((issn) => appendIndex(index.issn, issn, item));
    if (item.titleKey) appendIndex(index.title, item.titleKey, item);
  });

  return index;
}

function appendIndex(map, key, item) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(item);
}

function renderRow(row) {
  const tr = document.createElement("tr");
  tr.append(
    cell(titleBlock(row)),
    cell(badge(row.abdc2025)),
    cell(metricList(row.abs, formatAbs), "col-abs"),
    cell(metricList(row.jcr, formatJcr), "col-jcr"),
    cell(metricList(row.sjr, formatSjr), "col-sjr"),
    textCell(row.publisher || " ", "col-publisher"),
    cell(issnBlock(row), "col-issn")
  );
  return tr;
}

function titleBlock(row) {
  const wrapper = document.createElement("div");
  const title = document.createElement("div");
  title.className = "journal-title";
  title.textContent = row.title;
  const year = document.createElement("div");
  year.className = "subtle";
  year.textContent = row.yearInception ? `Inception: ${row.yearInception}` : "";
  wrapper.append(title, year);
  return wrapper;
}

function issnBlock(row) {
  const wrapper = document.createElement("div");
  wrapper.append(
    smallLine(row.issn ? `Print: ${row.issn}` : "Print: n/a"),
    smallLine(row.eissn ? `Online: ${row.eissn}` : "Online: n/a")
  );
  return wrapper;
}

function smallLine(text) {
  const div = document.createElement("div");
  div.className = "subtle";
  div.textContent = text;
  return div;
}

function badge(value) {
  const span = document.createElement("span");
  span.className = `badge${value ? "" : " empty"}`;
  span.textContent = value || "n/a";
  return span;
}

function metricList(items, formatter) {
  if (!items.length) return badge("");
  const wrapper = document.createElement("div");
  wrapper.className = "metric-list";
  items.forEach((item) => {
    const span = document.createElement("span");
    span.textContent = formatter(item);
    wrapper.appendChild(span);
  });
  return wrapper;
}

function formatAbs(item) {
  const history = [item.ajg2021 && `2021 ${item.ajg2021}`, item.ajg2018 && `2018 ${item.ajg2018}`]
    .filter(Boolean)
    .join("; ");
  return [item.rating || "ABS n/a", item.field, history].filter(Boolean).join(" | ");
}

function formatJcr(item) {
  const metric = item.ais ? `AIS ${item.ais}` : [item.jif && `JIF ${item.jif}`, item.jci && `JCI ${item.jci}`].filter(Boolean).join("; ");
  const rank = item.categoryRank ? `rank ${item.categoryRank}` : item.jifRank ? `rank ${item.jifRank}` : "";
  return [metric || "JCR n/a", item.quartile, item.field, rank].filter(Boolean).join(" | ");
}

function formatSjr(item) {
  const quartile = item.quartile || "Q n/a";
  const field = item.field || "field n/a";
  const score = item.sjr ? `SJR ${item.sjr}` : "";
  return [field, quartile, score].filter(Boolean).join(" | ");
}

function cell(child, className = "") {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.appendChild(child);
  return td;
}

function textCell(text, className = "") {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

async function importCsv(event, type) {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  const parsed = parseCsv(text).map((row) => normalizeImportRow(row, type)).filter(Boolean);
  state.imports[type] = parsed;
  localStorage.setItem("journalRankingImports", JSON.stringify(state.imports));
  els.importStatus.textContent = `${file.name}: imported ${parsed.length.toLocaleString()} ${type.toUpperCase()} rows.`;
  event.target.value = "";
  rebuildIndexes();
  render();
}

function normalizeImportRow(row, type) {
  const title = pick(row, ["title", "journal", "journal title", "source title", "name"]);
  const issn = normalizeIssn(pick(row, ["issn", "print issn", "pissn"]));
  const eissn = normalizeIssn(pick(row, ["eissn", "online issn", "electronic issn"]));
  const field = pick(row, ["field", "category", "subject", "subject category", "research field"]);
  const titleKey = normalizeTitle(title);

  if (!titleKey && !issn && !eissn) return null;

  if (type === "abs") {
    return {
      title,
      titleKey,
      issn,
      eissn,
      field,
      rating: pick(row, ["abs", "ajg", "ajg2024", "abs2024", "rating", "rank", "category"])
    };
  }

  if (type === "jcr") {
    return {
      title,
      titleKey,
      issn,
      eissn,
      field,
      ais: pick(row, ["ais", "article influence score", "article influence"]),
      quartile: normalizeQuartile(pick(row, ["quartile", "jif quartile", "jcr quartile"]))
    };
  }

  return {
    title,
    titleKey,
    issn,
    eissn,
    field,
    quartile: normalizeQuartile(pick(row, ["quartile", "sjr quartile", "jsr quartile", "best quartile"])),
    sjr: pick(row, ["sjr", "jsr", "score"])
  };
}

function normalizeAbdcRecord(record) {
  return {
    ...record,
    title: record.title || "",
    issn: normalizeIssn(record.issn),
    eissn: normalizeIssn(record.eissn),
    publisher: record.publisher || "",
    fieldOfResearch: record.fieldOfResearch || "",
    abdc2025: record.abdc2025 || "",
    yearInception: record.yearInception || ""
  };
}

function normalizeAbsRecord(record) {
  const title = record.title || "";
  const issn = normalizeIssn(record.issn);
  return {
    title,
    titleKey: normalizeTitle(title),
    issn,
    eissn: "",
    field: record.field || "",
    publisher: record.publisher || "",
    rating: record.ajg2024 || "",
    ajg2021: record.ajg2021 || "",
    ajg2018: record.ajg2018 || "",
    source: "Academic Journal Guide 2024"
  };
}

function normalizeJcrRecord(record) {
  const title = record.title || "";
  return {
    title,
    titleKey: normalizeTitle(title),
    issn: normalizeIssn(record.issn),
    eissn: normalizeIssn(record.eissn),
    field: record.field || "",
    publisher: record.publisher || "",
    quartile: normalizeQuartile(record.quartile),
    ais: record.ais || "",
    jif: record.jif || "",
    fiveYearJif: record.fiveYearJif || "",
    jci: record.jci || "",
    categoryRank: record.categoryRank || "",
    jifRank: record.jifRank || "",
    source: "JCR Impact Factor 2025"
  };
}

function normalizeSjrRecord(record) {
  const title = record.title || "";
  const issns = Array.isArray(record.issns) ? record.issns.map(normalizeIssn).filter(Boolean) : [];
  const issn = normalizeIssn(record.issn) || issns[0] || "";
  return {
    title,
    titleKey: normalizeTitle(title),
    issn,
    eissn: "",
    issns,
    field: record.field || "",
    publisher: record.publisher || "",
    quartile: normalizeQuartile(record.quartile || record.bestQuartile),
    bestQuartile: normalizeQuartile(record.bestQuartile),
    sjr: record.sjr || "",
    sourceId: record.sourceId || "",
    source: "SCImago Journal Rank 2025"
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cellValue = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cellValue += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cellValue);
      cellValue = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cellValue);
      rows.push(row);
      row = [];
      cellValue = "";
    } else {
      cellValue += char;
    }
  }

  if (cellValue || row.length) {
    row.push(cellValue);
    rows.push(row);
  }

  const headers = (rows.shift() || []).map((header) => normalizeHeader(header));
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])));
}

function pick(row, names) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (row[key]) return row[key].trim();
  }
  return "";
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function getForLabel(code) {
  return FOR_LABELS[String(code).trim()] || String(code || "").trim();
}

function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

function normalizeTitle(value) {
  return normalizeText(value).replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function normalizeIssn(value) {
  const compact = String(value || "").toUpperCase().replace(/[^0-9X]/g, "");
  if (compact.length !== 8) return "";
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function normalizeQuartile(value) {
  const match = String(value || "").toUpperCase().match(/Q[1-4]/);
  return match ? match[0] : String(value || "").trim();
}

function buildKeys(journal) {
  return {
    title: normalizeTitle(journal.title),
    issns: new Set([
      ...(Array.isArray(journal.issns) ? journal.issns : []),
      journal.issn,
      journal.eissn
    ].map(normalizeIssn).filter(Boolean))
  };
}

function compareRows(a, b) {
  const direction = state.sort.direction === "asc" ? 1 : -1;
  const av = sortValue(a, state.sort.key);
  const bv = sortValue(b, state.sort.key);
  return direction * av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

function sortValue(row, key) {
  if (key === "abs") return row.absText || "";
  return String(row[key] || "");
}

function sortRankValue(a, b) {
  const order = ["A*", "A", "B", "C"];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  return a.localeCompare(b);
}

function restoreImports() {
  try {
    const stored = JSON.parse(localStorage.getItem("journalRankingImports") || "{}");
    state.imports = {
      abs: Array.isArray(stored.abs) ? stored.abs : [],
      jcr: Array.isArray(stored.jcr) ? stored.jcr : [],
      sjr: Array.isArray(stored.sjr) ? stored.sjr : []
    };
  } catch {
    state.imports = { abs: [], jcr: [], sjr: [] };
  }
}
