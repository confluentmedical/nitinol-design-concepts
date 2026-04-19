/* global importScripts, AbaqusMatpropsFit, AbaqusMatpropsParser */
"use strict";

importScripts(
  "vendor/papaparse.min.js",
  "vendor/xlsx.full.min.js",
  "abaqus_matprops_fit.js",
  "abaqus_matprops_parser.js",
);

const fileCache = new Map();
const MAX_PREFERRED_STRESS_RANGE_MPA = 2000;

function postProgress(requestId, message) {
  self.postMessage({ type: "progress", requestId, message });
}

function postResult(requestId, payload) {
  self.postMessage({ type: "result", requestId, payload });
}

function postError(requestId, error) {
  self.postMessage({
    type: "error",
    requestId,
    error: error && error.message ? error.message : String(error),
  });
}

function uniqueFileId(baseId, usedIds) {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

async function loadAndInspectFiles(files, requestId) {
  if (!files.length) throw new Error("At least one tensile file is required.");
  if (files.length > AbaqusMatpropsParser.LIMITS.maxFiles) {
    throw new Error(`A maximum of ${AbaqusMatpropsParser.LIMITS.maxFiles} files can be processed at once.`);
  }
  const usedIds = new Set();
  const fileDataItems = [];
  const inspections = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const stem = file.name.replace(/\.[^.]+$/, "");
    const baseId = AbaqusMatpropsFit.slug(stem) || `dataset_${index + 1}`;
    const fileId = uniqueFileId(baseId, usedIds);
    postProgress(requestId, `Reading ${file.name}...`);
    const fileData = await AbaqusMatpropsParser.loadFileData(file, index, fileId);
    fileData.file_id = fileId;
    fileCache.set(fileId, fileData);
    postProgress(requestId, `Detecting columns in ${file.name}...`);
    const inspection = AbaqusMatpropsParser.inspectFileData(fileData);
    fileDataItems.push(fileData);
    inspections.push(inspection);
  }
  return { fileDataItems, inspections };
}

function fitOne(fileData, config, globalSettings) {
  const parsed = AbaqusMatpropsParser.parseDataset(fileData, config);
  return AbaqusMatpropsFit.fitParsedDataset(parsed, config, globalSettings);
}

function finiteNumbers(values) {
  return values.filter((value) => Number.isFinite(value));
}

function rawStressValuesFromChart(dataset) {
  const rawTrace = (dataset.chart_spec?.data || []).find((trace) => trace.name === "Raw tensile data");
  return finiteNumbers(rawTrace?.y || []);
}

function sharedPlasticBoundsFromDatasets(datasets) {
  const starts = finiteNumbers(datasets.map((dataset) => dataset.plastic_bounds_engineering_strain?.[0]));
  const ends = finiteNumbers(datasets.map((dataset) => dataset.plastic_bounds_engineering_strain?.[1]));
  if (!starts.length || !ends.length) return null;
  const start = Math.max(AbaqusMatpropsFit.MIN_PLASTIC_ENGINEERING_STRAIN, Math.min(...starts));
  const end = Math.max(...ends);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function applySharedPlasticBounds(fileDataItems, baseConfigs, globalSettings, firstPassDatasets, requestId) {
  const sharedBounds = sharedPlasticBoundsFromDatasets(firstPassDatasets);
  if (!sharedBounds) return firstPassDatasets;
  return fileDataItems.map((fileData, index) => {
    const config = {
      ...firstPassDatasets[index].config,
      ...baseConfigs[index],
      plastic_start_override_engineering_strain: sharedBounds.start,
      plastic_end_override_engineering_strain: sharedBounds.end,
      enforce_plastic_bounds: true,
    };
    postProgress(requestId, `Applying shared plastic range to ${fileData.file_name}...`);
    return fitOne(fileData, config, globalSettings);
  });
}

function chartAxisRanges(datasets) {
  const xValues = [];
  const yValues = [];
  datasets.forEach((dataset) => {
    (dataset.chart_spec?.data || []).forEach((trace) => {
      xValues.push(...finiteNumbers(trace.x || []));
    });
    yValues.push(...rawStressValuesFromChart(dataset));
    xValues.push(...finiteNumbers(dataset.plastic_bounds_true_strain || []));
  });
  if (!xValues.length || !yValues.length) return null;
  let xMin = Math.min(0, ...xValues);
  let xMax = Math.max(...xValues);
  let yMin = Math.min(0, ...yValues);
  const actualYMax = Math.max(...yValues);
  const xPad = Math.max((xMax - xMin) * 0.04, 0.005);
  const yPad = Math.max((actualYMax - yMin) * 0.06, 25);
  xMin = Math.max(0, xMin - xPad);
  xMax += xPad;
  yMin = Math.max(0, yMin - yPad);
  const yMax = Math.min(actualYMax + yPad, MAX_PREFERRED_STRESS_RANGE_MPA);
  return {
    x: [xMin, xMax],
    y: [yMin, yMax],
  };
}

function applySharedChartRanges(datasets) {
  const ranges = chartAxisRanges(datasets);
  if (!ranges) return;
  datasets.forEach((dataset) => {
    if (!dataset.chart_spec?.layout) return;
    dataset.chart_spec.layout.xaxis = {
      ...(dataset.chart_spec.layout.xaxis || {}),
      range: ranges.x,
    };
    dataset.chart_spec.layout.yaxis = {
      ...(dataset.chart_spec.layout.yaxis || {}),
      range: ranges.y,
    };
  });
}

function buildPayload(sessionId, datasets, globalSettings) {
  applySharedChartRanges(datasets);
  const resultsTable = AbaqusMatpropsFit.buildResultsTable(datasets);
  return {
    session_id: sessionId,
    frontend_only: true,
    global_settings: globalSettings,
    datasets,
    results_table: resultsTable,
    charts: datasets.map((dataset) => ({
      file_id: dataset.config.file_id,
      label: dataset.config.label,
      figure: dataset.chart_spec,
    })),
    diagnostics: datasets.map((dataset) => ({
      dataset: dataset.config.label,
      selected_window: dataset.moving_average_window_selected,
      tested_windows: dataset.diagnostics.tested_windows,
    })),
  };
}

async function analyze(requestId, files, globalSettingsOverrides) {
  const globalSettings = AbaqusMatpropsFit.sanitizeSettings(globalSettingsOverrides);
  const sessionId = `abaqus-matprops-browser-${Date.now().toString(36)}`;
  const { fileDataItems, inspections } = await loadAndInspectFiles(files, requestId);
  const firstPassDatasets = [];
  for (let index = 0; index < fileDataItems.length; index += 1) {
    const fileData = fileDataItems[index];
    const config = inspections[index];
    postProgress(requestId, `Fitting ${fileData.file_name}...`);
    firstPassDatasets.push(fitOne(fileData, config, globalSettings));
  }
  const datasets = applySharedPlasticBounds(fileDataItems, inspections, globalSettings, firstPassDatasets, requestId);
  return buildPayload(sessionId, datasets, globalSettings);
}

async function refit(requestId, datasetConfigs, globalSettingsOverrides, sessionId) {
  const globalSettings = AbaqusMatpropsFit.sanitizeSettings(globalSettingsOverrides);
  const fileDataItems = [];
  const firstPassDatasets = [];
  for (const config of datasetConfigs) {
    const fileData = fileCache.get(config.file_id);
    if (!fileData) throw new Error(`Source data for ${config.label || config.file_id} is no longer available. Re-select the input files.`);
    postProgress(requestId, `Refitting ${config.file_name || config.label || config.file_id}...`);
    fileDataItems.push(fileData);
    firstPassDatasets.push(fitOne(fileData, config, globalSettings));
  }
  const datasets = applySharedPlasticBounds(fileDataItems, datasetConfigs, globalSettings, firstPassDatasets, requestId);
  return buildPayload(sessionId || `abaqus-matprops-browser-${Date.now().toString(36)}`, datasets, globalSettings);
}

self.addEventListener("message", async (event) => {
  const { requestId, action } = event.data || {};
  try {
    if (action === "analyze") {
      postResult(requestId, await analyze(requestId, Array.from(event.data.files || []), event.data.globalSettings || {}));
      return;
    }
    if (action === "refit") {
      postResult(
        requestId,
        await refit(requestId, event.data.datasetConfigs || [], event.data.globalSettings || {}, event.data.sessionId),
      );
      return;
    }
    throw new Error(`Unknown worker action: ${action}`);
  } catch (error) {
    postError(requestId, error);
  }
});
