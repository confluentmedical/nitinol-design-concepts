(function (root, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./abaqus_matprops_fit.js"));
  } else {
    root.AbaqusMatpropsParser = factory(root.AbaqusMatpropsFit);
  }
})(typeof self !== "undefined" ? self : globalThis, function (Fit) {
  "use strict";

  const LIMITS = Object.freeze({
    maxFiles: 8,
    maxFileBytes: 20 * 1024 * 1024,
    maxNumericRows: 100000,
  });

  function cleanCell(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function toFloat(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replaceAll(",", "");
    if (!text) return null;
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function stressHeaderScore(value) {
    const text = String(value || "").toLowerCase();
    let score = 0;
    if (text.includes("stress")) score += 3;
    if (text.includes("tensile")) score += 2;
    if (text.includes("load")) score -= 1;
    return score;
  }

  function strainHeaderScore(value) {
    const text = String(value || "").toLowerCase();
    let score = 0;
    if (text.includes("strain")) score += 3;
    if (text.includes("tensile")) score += 2;
    if (text.includes("extension")) score -= 1;
    return score;
  }

  function detectHeaderLayout(rows) {
    let best = null;
    rows.forEach((row, rowIndex) => {
      if (!row || !row.length) return;
      const scores = [];
      row.forEach((cell, colIndex) => {
        const text = cleanCell(cell);
        if (!text) return;
        scores.push([colIndex, text, stressHeaderScore(text), strainHeaderScore(text)]);
      });
      const stressCandidates = scores.filter((item) => item[2] > 0);
      const strainCandidates = scores.filter((item) => item[3] > 0);
      if (!stressCandidates.length || !strainCandidates.length) return;
      stressCandidates.sort((left, right) => (right[2] - left[2]) || (left[0] - right[0]));
      const stressChoice = stressCandidates[0];
      const strainChoice = strainCandidates
        .filter((item) => item[0] !== stressChoice[0])
        .sort((left, right) => (right[3] - left[3]) || (left[0] - right[0]))[0];
      if (!strainChoice) return;
      const candidate = {
        header_row_index: rowIndex,
        headers: row.map((cell, index) => cleanCell(cell) || `Column ${index + 1}`),
        stress_column: stressChoice[1],
        strain_column: strainChoice[1],
        stress_index: stressChoice[0],
        strain_index: strainChoice[0],
        score: stressChoice[2] + strainChoice[3],
      };
      if (!best || candidate.score > best.score) best = candidate;
    });
    if (!best) return null;
    const unitRowIndex = best.header_row_index + 1;
    if (unitRowIndex < rows.length) {
      best.unit_row_index = unitRowIndex;
      best.unit_row = rows[unitRowIndex].map(cleanCell);
    } else {
      best.unit_row_index = null;
      best.unit_row = [];
    }
    return best;
  }

  function unitHint(header, unitCell) {
    const text = `${header || ""} ${unitCell || ""}`.toLowerCase();
    if (text.includes("ksi")) return "ksi";
    if (text.includes("mpa")) return "mpa";
    if (text.includes("%") || text.includes("percent")) return "percent";
    if (text.includes("strain")) return "ratio";
    return "unknown";
  }

  function findColumnIndex(headers, selected, fallback) {
    const exact = headers.findIndex((header) => header === selected);
    if (exact >= 0) return exact;
    const normalized = Fit.slug(selected);
    const slugged = headers.findIndex((header) => Fit.slug(header) === normalized);
    return slugged >= 0 ? slugged : fallback;
  }

  function extractNumericRows(rows, headers, startRowIndex, options) {
    const ignoreLeadingRows = Number.parseInt((options && options.ignoreLeadingRows) || 0, 10);
    const dataRows = [];
    let skipped = 0;
    for (let rowIndex = startRowIndex; rowIndex < rows.length; rowIndex += 1) {
      const padded = rows[rowIndex].slice();
      while (padded.length < headers.length) padded.push("");
      const numeric = padded.slice(0, headers.length).map(toFloat);
      if (numeric.every((value) => value === null)) continue;
      if (numeric.some((value) => value === null)) continue;
      if (skipped < ignoreLeadingRows) {
        skipped += 1;
        continue;
      }
      dataRows.push(numeric);
      if (dataRows.length > LIMITS.maxNumericRows) {
        throw new Error(`More than ${LIMITS.maxNumericRows.toLocaleString()} numeric rows were detected. Split the file or downsample before fitting.`);
      }
    }
    return dataRows;
  }

  function parseCsvRows(text) {
    if (typeof Papa !== "undefined") {
      const parsed = Papa.parse(text, { skipEmptyLines: false });
      if (parsed.errors && parsed.errors.length) {
        const fatal = parsed.errors.find((error) => error.type === "Delimiter" || error.type === "Quotes");
        if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
      }
      return parsed.data.map((row) => row.map(cleanCell));
    }
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(cleanCell(cell));
        cell = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(cleanCell(cell));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (cell || row.length) {
      row.push(cleanCell(cell));
      rows.push(row);
    }
    return rows;
  }

  async function loadFileData(file, fileIndex, preferredFileId) {
    if (file.size > LIMITS.maxFileBytes) {
      throw new Error(`${file.name} is larger than the ${Math.round(LIMITS.maxFileBytes / 1024 / 1024)} MB per-file limit.`);
    }
    const suffix = (file.name.split(".").pop() || "").toLowerCase();
    const stem = file.name.replace(/\.[^.]+$/, "");
    const baseId = preferredFileId || Fit.slug(stem) || `dataset_${fileIndex + 1}`;
    if (suffix === "csv") {
      const rows = parseCsvRows(await file.text());
      return {
        file_id: baseId,
        label: stem,
        file_name: file.name,
        kind: "csv",
        available_sheets: [],
        sheets: { "CSV input": rows },
      };
    }
    if (suffix === "xlsx") {
      if (typeof XLSX === "undefined") throw new Error("SheetJS is not loaded. XLSX files cannot be read.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: false, cellNF: false, cellStyles: false });
      const sheets = {};
      workbook.SheetNames.forEach((sheetName) => {
        sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false }).map((row) => row.map(cleanCell));
      });
      return {
        file_id: baseId,
        label: stem,
        file_name: file.name,
        kind: "xlsx",
        available_sheets: workbook.SheetNames.slice(),
        sheets,
      };
    }
    throw new Error(`${file.name} is not supported. Upload CSV or XLSX files only.`);
  }

  function loadCsvDataFromText(fileName, text, fileIndex) {
    const stem = fileName.replace(/\.[^.]+$/, "");
    return {
      file_id: Fit.slug(stem) || `dataset_${fileIndex + 1}`,
      label: stem,
      file_name: fileName,
      kind: "csv",
      available_sheets: [],
      sheets: { "CSV input": parseCsvRows(text) },
    };
  }

  function readRowsForSelection(fileData, sheetName) {
    if (fileData.kind === "csv") {
      const rows = fileData.sheets["CSV input"];
      const layout = detectHeaderLayout(rows);
      if (!layout) throw new Error(`Could not detect stress/strain headers in ${fileData.file_name}`);
      return { rows, layout };
    }
    if (sheetName) {
      const rows = fileData.sheets[sheetName];
      if (!rows) throw new Error(`Sheet ${sheetName} was not found in ${fileData.file_name}`);
      const layout = detectHeaderLayout(rows);
      if (!layout) throw new Error(`Could not detect stress/strain headers in ${fileData.file_name}:${sheetName}`);
      layout.selected_sheet = sheetName;
      return { rows, layout };
    }
    let best = null;
    Object.entries(fileData.sheets).forEach(([candidateSheet, rows]) => {
      const layout = detectHeaderLayout(rows);
      if (!layout) return;
      if (!best || layout.score > best.layout.score) {
        layout.selected_sheet = candidateSheet;
        best = { rows, layout };
      }
    });
    if (!best) throw new Error(`Could not detect stress/strain headers in ${fileData.file_name}`);
    return best;
  }

  function inspectFileData(fileData) {
    const { rows, layout } = readRowsForSelection(fileData, null);
    const headers = layout.headers;
    const unitRow = layout.unit_row || [];
    const stressIndex = layout.stress_index;
    const strainIndex = layout.strain_index;
    const dataStartIndex = layout.unit_row_index !== null && layout.unit_row_index !== undefined
      ? layout.unit_row_index + 1
      : layout.header_row_index + 1;
    const numericRows = extractNumericRows(rows, headers, dataStartIndex, { ignoreLeadingRows: 0 });
    const preview = numericRows.slice(0, 5).map((row) => ({
      stress_raw: row[stressIndex],
      strain_raw: row[strainIndex],
    }));
    return {
      file_id: fileData.file_id,
      label: fileData.label,
      file_name: fileData.file_name,
      sheet_name: layout.selected_sheet,
      available_sheets: fileData.available_sheets || [],
      available_columns: headers,
      stress_column: layout.stress_column,
      strain_column: layout.strain_column,
      stress_unit_source: unitHint(headers[stressIndex], unitRow[stressIndex] || ""),
      strain_unit_source: unitHint(headers[strainIndex], unitRow[strainIndex] || ""),
      ignore_leading_rows: 0,
      preview_rows: preview,
    };
  }

  function parseDataset(fileData, config) {
    const { rows, layout } = readRowsForSelection(fileData, config.sheet_name);
    const headers = layout.headers;
    const stressIndex = findColumnIndex(headers, config.stress_column || layout.stress_column, layout.stress_index);
    const strainIndex = findColumnIndex(headers, config.strain_column || layout.strain_column, layout.strain_index);
    const dataStartIndex = layout.unit_row_index !== null && layout.unit_row_index !== undefined
      ? layout.unit_row_index + 1
      : layout.header_row_index + 1;
    const dataRows = extractNumericRows(rows, headers, dataStartIndex, { ignoreLeadingRows: Number.parseInt(config.ignore_leading_rows || 0, 10) });
    if (!dataRows.length) throw new Error(`No numeric stress/strain data could be read from ${fileData.file_name}`);
    const stressRaw = dataRows.map((row) => row[stressIndex]);
    const strainRaw = dataRows.map((row) => row[strainIndex]);
    const unitRow = layout.unit_row || [];
    const stressUnit = config.stress_unit_source || unitHint(headers[stressIndex], unitRow[stressIndex] || "");
    const strainUnit = config.strain_unit_source || unitHint(headers[strainIndex], unitRow[strainIndex] || "");
    const engineeringStress = Fit.normalizeUnits(stressRaw, stressUnit, "stress");
    const engineeringStrain = Fit.normalizeUnits(strainRaw, strainUnit, "strain");
    const trueStress = engineeringStress.map((stress, index) => stress * (1.0 + engineeringStrain[index]));
    const trueStrain = engineeringStrain.map((strain) => Math.log1p(strain));
    return {
      label: config.label || fileData.label,
      file_name: fileData.file_name,
      available_columns: headers,
      sheet_name: layout.selected_sheet || config.sheet_name || null,
      stress_column: headers[stressIndex],
      strain_column: headers[strainIndex],
      stress_unit_source: stressUnit,
      strain_unit_source: strainUnit,
      engineering_stress_mpa: engineeringStress,
      engineering_strain: engineeringStrain,
      true_stress_raw: trueStress,
      true_strain_raw: trueStrain,
      preview_rows: engineeringStress.slice(0, 5).map((stress, index) => ({
        stress_mpa: stress,
        strain: engineeringStrain[index],
      })),
    };
  }

  return {
    LIMITS,
    cleanCell,
    toFloat,
    detectHeaderLayout,
    unitHint,
    parseCsvRows,
    loadFileData,
    loadCsvDataFromText,
    inspectFileData,
    parseDataset,
  };
});
