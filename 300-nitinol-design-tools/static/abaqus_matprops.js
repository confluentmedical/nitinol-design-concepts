const analyzeForm = document.getElementById("matprops-analyze-form");
const analyzeButton = document.getElementById("matprops-analyze-button");
const refitButton = document.getElementById("matprops-refit-button");
const statusNode = document.getElementById("matprops-status");
const workspace = document.getElementById("matprops-workspace");
const datasetReview = document.getElementById("dataset-review");
const resultsGrid = document.getElementById("results-grid");
const chartStack = document.getElementById("chart-stack");
const debugInfo = document.getElementById("debug-info");
const exportWorkbookButton = document.getElementById("export-workbook-button");

const state = {
  payload: null,
  resultsHot: null,
  requestId: 0,
  pendingRequests: new Map(),
  worker: null,
  plotlyPromise: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assetPath(path) {
  const base = typeof window.NDT_STATIC_BASE === "string" ? window.NDT_STATIC_BASE : "";
  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return cleanBase ? `${cleanBase}/${cleanPath}` : cleanPath;
}

function ensurePlotly() {
  if (typeof Plotly !== "undefined") return Promise.resolve(Plotly);
  if (state.plotlyPromise) return state.plotlyPromise;
  state.plotlyPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = assetPath("vendor/plotly-2.35.2.min.js");
    script.async = true;
    script.onload = () => {
      if (typeof Plotly === "undefined") {
        reject(new Error("Plotly failed to initialize."));
        return;
      }
      resolve(Plotly);
    };
    script.onerror = () => reject(new Error("Plotly failed to load."));
    document.head.appendChild(script);
  });
  return state.plotlyPromise;
}

function setStatus(message) {
  statusNode.textContent = message || "";
}

function setBusy(isBusy) {
  analyzeButton.disabled = isBusy;
  refitButton.disabled = isBusy || !state.payload;
  exportWorkbookButton.disabled = isBusy || !state.payload;
}

function ensureWorker() {
  if (state.worker) return state.worker;
  if (typeof Worker === "undefined") {
    throw new Error("This browser does not support Web Workers. Use a current browser to run frontend-only fitting.");
  }
  state.worker = new Worker(assetPath("abaqus_matprops_worker.js"));
  state.worker.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "progress") {
      setStatus(message.message || "");
      return;
    }
    const pending = state.pendingRequests.get(message.requestId);
    if (!pending) return;
    if (message.type === "result") {
      state.pendingRequests.delete(message.requestId);
      pending.resolve(message.payload);
      return;
    }
    if (message.type === "error") {
      state.pendingRequests.delete(message.requestId);
      pending.reject(new Error(message.error || "Worker failed"));
    }
  });
  state.worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Abaqus Matprops worker failed.");
    state.pendingRequests.forEach((pending) => pending.reject(error));
    state.pendingRequests.clear();
  });
  return state.worker;
}

function callWorker(action, payload) {
  const worker = ensureWorker();
  const requestId = `matprops-${Date.now().toString(36)}-${state.requestId += 1}`;
  return new Promise((resolve, reject) => {
    state.pendingRequests.set(requestId, { resolve, reject });
    worker.postMessage({ requestId, action, ...payload });
  });
}

function numberValue(id) {
  const node = document.getElementById(id);
  if (!node || node.value === "") return null;
  return Number(node.value);
}

function globalSettingsPayload() {
  return {
    moving_average_mode: document.getElementById("moving_average_mode").value,
    moving_average_window_points: numberValue("moving_average_window_points"),
    modulus_cutoff: numberValue("modulus_cutoff"),
    reference_temperature_c: numberValue("reference_temperature_c"),
    dsig_dt_loading_mpa_per_c: numberValue("dsig_dt_loading_mpa_per_c"),
    dsig_dt_unloading_mpa_per_c: numberValue("dsig_dt_unloading_mpa_per_c"),
  };
}

function formatNumber(value, digits = 4) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (Math.abs(numeric) >= 1000) return numeric.toFixed(1);
  if (Math.abs(numeric) >= 100) return numeric.toFixed(2);
  return numeric.toFixed(digits).replace(/\.?0+$/, "");
}

function renderPreviewRows(rows) {
  if (!rows || !rows.length) {
    return '<div class="rd-muted">No normalized preview rows available.</div>';
  }
  return `
    <div class="rd-table-preview">
      <table>
        <thead>
          <tr>
            <th>Stress (MPa)</th>
            <th>Engineering strain</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(formatNumber(row.stress_mpa ?? row.stress_raw))}</td>
              <td>${escapeHtml(formatNumber(row.strain ?? row.strain_raw, 6))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDatasetReview() {
  datasetReview.innerHTML = state.payload.datasets.map((dataset) => {
    const config = dataset.config;
    const warnings = dataset.warnings || [];
    const sheetControl = config.available_sheets && config.available_sheets.length
      ? `
        <label class="rd-field">
          <span>Sheet</span>
          <select data-file-id="${escapeHtml(config.file_id)}" data-field="sheet_name">
            ${config.available_sheets.map((sheet) => `<option value="${escapeHtml(sheet)}" ${sheet === config.sheet_name ? "selected" : ""}>${escapeHtml(sheet)}</option>`).join("")}
          </select>
        </label>
      `
      : `
        <label class="rd-field">
          <span>Sheet</span>
          <input data-file-id="${escapeHtml(config.file_id)}" data-field="sheet_name" type="text" value="${escapeHtml(config.sheet_name || "CSV input")}" disabled />
        </label>
      `;
    return `
      <article class="rd-dataset-card" data-dataset-card="${escapeHtml(config.file_id)}">
        <div class="rd-dataset-head">
          <div>
            <h3>${escapeHtml(config.label)}</h3>
            <p class="rd-muted">${escapeHtml(config.file_name)} · selected smoothing window ${escapeHtml(dataset.moving_average_window_selected)}</p>
          </div>
          <div class="rd-pill-row">
            <span class="rd-pill ${dataset.status === "partial" ? "warning" : ""}">${escapeHtml(dataset.status)}</span>
            <span class="rd-pill neutral">${escapeHtml(dataset.diagnostics.moving_average_mode)}</span>
          </div>
        </div>
        <div class="rd-section-grid">
          ${sheetControl}
          <label class="rd-field">
            <span>Stress column</span>
            <select data-file-id="${escapeHtml(config.file_id)}" data-field="stress_column">
              ${config.available_columns.map((column) => `<option value="${escapeHtml(column)}" ${column === config.stress_column ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}
            </select>
          </label>
          <label class="rd-field">
            <span>Strain column</span>
            <select data-file-id="${escapeHtml(config.file_id)}" data-field="strain_column">
              ${config.available_columns.map((column) => `<option value="${escapeHtml(column)}" ${column === config.strain_column ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}
            </select>
          </label>
          <label class="rd-field">
            <span>Stress units</span>
            <select data-file-id="${escapeHtml(config.file_id)}" data-field="stress_unit_source">
              <option value="mpa" ${config.stress_unit_source === "mpa" ? "selected" : ""}>MPa</option>
              <option value="ksi" ${config.stress_unit_source === "ksi" ? "selected" : ""}>ksi</option>
            </select>
          </label>
          <label class="rd-field">
            <span>Strain units</span>
            <select data-file-id="${escapeHtml(config.file_id)}" data-field="strain_unit_source">
              <option value="percent" ${config.strain_unit_source === "percent" ? "selected" : ""}>percent</option>
              <option value="ratio" ${config.strain_unit_source === "ratio" ? "selected" : ""}>ratio</option>
            </select>
          </label>
          <label class="rd-field">
            <span>Ignore leading rows</span>
            <input data-file-id="${escapeHtml(config.file_id)}" data-field="ignore_leading_rows" type="number" min="0" step="1" value="${escapeHtml(config.ignore_leading_rows ?? 0)}" />
          </label>
          <label class="rd-field">
            <span>Plastic start override (engineering strain)</span>
            <input data-file-id="${escapeHtml(config.file_id)}" data-field="plastic_start_override_engineering_strain" type="number" step="0.0001" value="${escapeHtml(config.plastic_start_override_engineering_strain ?? "")}" placeholder="Auto" />
          </label>
          <label class="rd-field">
            <span>Plastic end override (engineering strain)</span>
            <input data-file-id="${escapeHtml(config.file_id)}" data-field="plastic_end_override_engineering_strain" type="number" step="0.0001" value="${escapeHtml(config.plastic_end_override_engineering_strain ?? "")}" placeholder="Auto" />
          </label>
        </div>
        ${renderPreviewRows(config.preview_rows)}
        ${warnings.length ? `<ul class="rd-warning-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
      </article>
    `;
  }).join("");
}

function renderResultsGrid() {
  if (state.resultsHot && typeof state.resultsHot.destroy === "function") {
    state.resultsHot.destroy();
    state.resultsHot = null;
  }
  const table = state.payload && state.payload.results_table;
  if (!table || !table.columns || !table.rows) {
    resultsGrid.innerHTML = '<div class="rd-muted">No fitted results available.</div>';
    return;
  }
  resultsGrid.innerHTML = `
    <div class="rd-table-preview rd-results-table-wrap">
      <table class="rd-results-table">
        <thead>
          <tr>
            ${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${table.rows.map((row) => `
            <tr>
              ${row.map((cell, index) => {
                const isSummary = index >= table.columns.length - 2;
                const display = index === 0 ? cell : formatNumber(cell, 6);
                return `<td${isSummary ? ' class="rd-summary-cell"' : ""}>${escapeHtml(display)}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCharts() {
  chartStack.innerHTML = state.payload.charts.map((chart) => `
    <article class="rd-chart-card">
      <div class="rd-dataset-head">
        <div>
          <h3>${escapeHtml(chart.label)}</h3>
        </div>
      </div>
      <div id="chart-${escapeHtml(chart.file_id)}" class="rd-chart"></div>
    </article>
  `).join("");
  ensurePlotly()
    .then(() => {
      state.payload.charts.forEach((chart) => {
        const node = document.getElementById(`chart-${chart.file_id}`);
        if (!node) return;
        Plotly.newPlot(node, chart.figure.data, chart.figure.layout, chart.figure.config);
      });
    })
    .catch((error) => {
      chartStack.insertAdjacentHTML("beforeend", `<div class="rd-muted">Chart rendering failed: ${escapeHtml(error.message)}</div>`);
    });
}

function renderDebugInfo() {
  if (!debugInfo || !state.payload) return;
  const rows = state.payload.datasets.map((dataset) => {
    const testedWindows = dataset.diagnostics.tested_windows || [];
    const score = dataset.diagnostics.score;
    return `
      <tr>
        <td>${escapeHtml(dataset.config.label)}</td>
        <td>${escapeHtml(dataset.status)}</td>
        <td>${escapeHtml(dataset.moving_average_window_selected)}</td>
        <td>${escapeHtml(dataset.diagnostics.moving_average_mode)}</td>
        <td>${escapeHtml((dataset.diagnostics.present_states || []).join(", "))}</td>
        <td>${escapeHtml(formatNumber(score, 6))}</td>
        <td>${escapeHtml(testedWindows.length)}</td>
        <td>${escapeHtml((dataset.warnings || []).join(" | ") || "None")}</td>
      </tr>
    `;
  }).join("");
  const debugPayload = {
    session_id: state.payload.session_id,
    frontend_only: state.payload.frontend_only,
    global_settings: state.payload.global_settings,
    diagnostics: state.payload.diagnostics,
  };
  debugInfo.innerHTML = `
    <div class="rd-debug-table-wrap">
      <table class="rd-debug-table">
        <thead>
          <tr>
            <th>Dataset</th>
            <th>Status</th>
            <th>Window</th>
            <th>Mode</th>
            <th>States</th>
            <th>Score</th>
            <th>Windows Tested</th>
            <th>Warnings</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <pre class="rd-debug-code">${escapeHtml(JSON.stringify(debugPayload, null, 2))}</pre>
  `;
}

function renderPayload(payload) {
  state.payload = payload;
  workspace.hidden = false;
  renderDatasetReview();
  renderResultsGrid();
  renderCharts();
  renderDebugInfo();
  setBusy(false);
}

function parseOptionalNumber(value) {
  if (value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function collectDatasetConfigs() {
  const configs = Object.fromEntries(
    state.payload.datasets.map((dataset) => [dataset.config.file_id, { ...dataset.config }]),
  );
  datasetReview.querySelectorAll("[data-file-id][data-field]").forEach((node) => {
    const fileId = node.dataset.fileId;
    const field = node.dataset.field;
    if (!configs[fileId]) configs[fileId] = { file_id: fileId };
    const value = node.value;
    if (field === "ignore_leading_rows") {
      configs[fileId][field] = value === "" ? 0 : Number(value);
      return;
    }
    if (field === "plastic_start_override_engineering_strain" || field === "plastic_end_override_engineering_strain") {
      configs[fileId][field] = parseOptionalNumber(value);
      return;
    }
    configs[fileId][field] = value === "" ? null : value;
  });
  return Object.values(configs);
}

async function runAnalyze(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const fileInput = document.getElementById("matprops-files");
  const files = Array.from(fileInput.files || []);
  setStatus("Analyzing tensile datasets locally in your browser...");
  setBusy(true);
  try {
    const payload = await callWorker("analyze", {
      files,
      globalSettings: globalSettingsPayload(),
    });
    renderPayload(payload);
    setStatus("Analysis complete. Review the per-file configuration and refit if needed.");
  } catch (error) {
    setStatus(`Analyze failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function runRefit() {
  if (!state.payload) return;
  setStatus("Refitting datasets locally with the current overrides...");
  setBusy(true);
  try {
    const payload = await callWorker("refit", {
      sessionId: state.payload.session_id,
      globalSettings: globalSettingsPayload(),
      datasetConfigs: collectDatasetConfigs(),
    });
    renderPayload(payload);
    setStatus("Refit complete.");
  } catch (error) {
    setStatus(`Refit failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

function runExport() {
  if (!state.payload) return;
  try {
    AbaqusMatpropsExport.downloadSummaryWorkbook(state.payload);
    setStatus("Workbook exported from the browser.");
  } catch (error) {
    setStatus(`Export failed: ${error.message}`);
  }
}

analyzeForm.addEventListener("submit", runAnalyze);
refitButton.addEventListener("click", runRefit);
exportWorkbookButton.addEventListener("click", runExport);
setBusy(false);
