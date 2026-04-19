(function (root, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AbaqusMatpropsFit = factory();
  }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
    moving_average_mode: "fixed",
    moving_average_window_points: 5,
    modulus_cutoff: 25000.0,
    reference_temperature_c: 37.0,
    dsig_dt_loading_mpa_per_c: 0.0,
    dsig_dt_unloading_mpa_per_c: 0.0,
    plastic_pair_count: 10,
  });

  const MOVING_AVERAGE_CANDIDATES = Object.freeze([5, 7, 9, 11, 13, 15, 17, 19, 21]);
  const MIN_PLASTIC_ENGINEERING_STRAIN = 0.07;
  const MIN_PLASTIC_TRUE_STRAIN = Math.log1p(MIN_PLASTIC_ENGINEERING_STRAIN);

  const STATE_NAMES = Object.freeze({
    1: "Austenite elasticity (loading, 1st cycle)",
    2: "Forward transformation (loading, 1st cycle)",
    3: "Martensite elasticity (loading, 1st cycle)",
    4: "Martensite elasticity (unloading, 1st cycle)",
    5: "Reverse transformation (unloading, 1st cycle)",
    6: "Austenite elasticity (unloading, 1st cycle)",
    7: "Austenite elasticity (loading, 2nd cycle)",
    8: "Forward transformation (loading, 2nd cycle)",
    9: "Martensite elasticity (loading, 2nd cycle)",
    10: "Plasticity (loading, 2nd cycle)",
  });

  const ABAQUS_PROPERTY_ROWS = Object.freeze([
    "Austenite elasticity (MPa)",
    "Austenite Poisson’s ratio",
    "Martensite elasticity (MPa)",
    "Martensite Poisson’s ratio",
    "Transformation strain",
    "ds/dT for loading (MPa/°C)",
    "Start transformation loading (MPa)",
    "End transformation loading (MPa)",
    "Reference temperature (°C)",
    "ds/dT for unloading (MPa/°C)",
    "Start transformation unloading (MPa)",
    "End transformation unloading (MPa)",
    "Start transform stress compression (MPa)",
    "Volumetric transformation strain",
    "Number of annealing steps",
    "Number of stress-strain points for plasticity",
    "Stress 1 in yield curve (MPa)",
    "Strain 1 in yield curve",
    "Stress 2 in yield curve (MPa)",
    "Strain 2 in yield curve",
    "Stress 3 in yield curve (MPa)",
    "Strain 3 in yield curve",
    "Stress 4 in yield curve (MPa)",
    "Strain 4 in yield curve",
    "Stress 5 in yield curve (MPa)",
    "Strain 5 in yield curve",
    "Stress 6 in yield curve (MPa)",
    "Strain 6 in yield curve",
    "Stress 7 in yield curve (MPa)",
    "Strain 7 in yield curve",
    "Stress 8 in yield curve (MPa)",
    "Strain 8 in yield curve",
    "Stress 9 in yield curve (MPa)",
    "Strain 9 in yield curve",
    "Stress 10 in yield curve (MPa)",
    "Strain 10 in yield curve",
  ]);

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function toFiniteNumber(value, fallback = null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function hasNumericOverride(value) {
    return value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));
  }

  function trueToEngineeringStrain(value) {
    return Number.isFinite(value) ? Math.expm1(value) : null;
  }

  function sanitizeSettings(overrides) {
    const settings = { ...DEFAULT_GLOBAL_SETTINGS, ...(overrides || {}) };
    settings.moving_average_window_points = sanitizeWindow(settings.moving_average_window_points);
    settings.modulus_cutoff = Number(settings.modulus_cutoff ?? DEFAULT_GLOBAL_SETTINGS.modulus_cutoff);
    settings.reference_temperature_c = Number(settings.reference_temperature_c ?? DEFAULT_GLOBAL_SETTINGS.reference_temperature_c);
    settings.dsig_dt_loading_mpa_per_c = Number(settings.dsig_dt_loading_mpa_per_c ?? DEFAULT_GLOBAL_SETTINGS.dsig_dt_loading_mpa_per_c);
    settings.dsig_dt_unloading_mpa_per_c = Number(settings.dsig_dt_unloading_mpa_per_c ?? DEFAULT_GLOBAL_SETTINGS.dsig_dt_unloading_mpa_per_c);
    settings.plastic_pair_count = Number.parseInt(settings.plastic_pair_count ?? DEFAULT_GLOBAL_SETTINGS.plastic_pair_count, 10);
    if (!Number.isFinite(settings.plastic_pair_count) || settings.plastic_pair_count < 1) {
      settings.plastic_pair_count = DEFAULT_GLOBAL_SETTINGS.plastic_pair_count;
    }
    settings.moving_average_mode = String(settings.moving_average_mode || "fixed").trim().toLowerCase();
    if (!Number.isFinite(settings.modulus_cutoff)) settings.modulus_cutoff = DEFAULT_GLOBAL_SETTINGS.modulus_cutoff;
    if (!Number.isFinite(settings.reference_temperature_c)) settings.reference_temperature_c = DEFAULT_GLOBAL_SETTINGS.reference_temperature_c;
    if (!Number.isFinite(settings.dsig_dt_loading_mpa_per_c)) settings.dsig_dt_loading_mpa_per_c = DEFAULT_GLOBAL_SETTINGS.dsig_dt_loading_mpa_per_c;
    if (!Number.isFinite(settings.dsig_dt_unloading_mpa_per_c)) settings.dsig_dt_unloading_mpa_per_c = DEFAULT_GLOBAL_SETTINGS.dsig_dt_unloading_mpa_per_c;
    return settings;
  }

  function normalizeUnits(values, unitName, kind) {
    const unit = String(unitName || "").trim().toLowerCase();
    if (kind === "stress" && unit === "ksi") {
      return values.map((value) => value * 6.89476);
    }
    if (kind === "strain" && unit === "percent") {
      return values.map((value) => value / 100.0);
    }
    return values.slice();
  }

  function movingAverage(values, window) {
    return values.map((_, index) => {
      const start = Math.max(0, index - window + 1);
      let sum = 0;
      let count = 0;
      for (let cursor = start; cursor <= index; cursor += 1) {
        sum += values[cursor];
        count += 1;
      }
      return sum / count;
    });
  }

  function almostConstant(values) {
    if (values.length < 2) return true;
    const first = values[0];
    return values.every((value) => Math.abs(value - first) <= 1e-8 + 1e-5 * Math.abs(first));
  }

  function linearFit(x, y) {
    if (!x || !y || x.length < 2 || y.length < 2) return null;
    const n = Math.min(x.length, y.length);
    let sumX = 0;
    let sumY = 0;
    for (let index = 0; index < n; index += 1) {
      sumX += x[index];
      sumY += y[index];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < n; index += 1) {
      const dx = x[index] - meanX;
      numerator += dx * (y[index] - meanY);
      denominator += dx * dx;
    }
    if (Math.abs(denominator) < 1e-18) return null;
    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;
    const yFit = [];
    let mseSum = 0;
    for (let index = 0; index < n; index += 1) {
      const predicted = slope * x[index] + intercept;
      yFit.push(predicted);
      mseSum += Math.pow(y[index] - predicted, 2);
    }
    return {
      slope,
      intercept,
      mse: mseSum / n,
      x: x.slice(0, n),
      y: y.slice(0, n),
      y_fit: yFit,
    };
  }

  function movingSlope(values, window) {
    if (values.length < 2) return values.map(() => 0);
    const halfWindow = Math.max(Math.floor(window / 2), 1);
    return values.map((_, index) => {
      const start = Math.max(0, index - halfWindow);
      const stop = Math.min(values.length, index + halfWindow + 1);
      const y = values.slice(start, stop);
      if (y.length < 2 || almostConstant(y)) return 0.0;
      const x = [];
      for (let cursor = start; cursor < stop; cursor += 1) x.push(cursor);
      const fit = linearFit(x, y);
      return fit ? fit.slope : 0.0;
    });
  }

  function stressDeltaSign(stress, index) {
    if (index <= 0 || index >= stress.length - 1) return 0.0;
    const delta = stress[index + 1] - stress[index - 1];
    return delta > 0 ? 1 : delta < 0 ? -1 : 0;
  }

  function segmentCurve(trueStrain, trueStress, modulusCutoff, window) {
    const slopeStress = movingSlope(trueStress, window);
    const slopeStrain = movingSlope(trueStrain, window);
    const modulus = trueStrain.map((_, index) => (
      Math.abs(slopeStrain[index]) > 1e-12 ? slopeStress[index] / slopeStrain[index] : 0.0
    ));
    const states = new Array(trueStrain.length).fill(0);
    const nonzeroStates = new Array(trueStrain.length).fill(0);
    if (!states.length) return { states, modulus };
    states[0] = 1;
    nonzeroStates[0] = 1;
    for (let index = 1; index < trueStrain.length - 1; index += 1) {
      const prevState = nonzeroStates[index - 1];
      const slope = modulus[index];
      const strainValue = trueStrain[index];
      const stressSign = stressDeltaSign(trueStress, index);
      let nextState = states[index - 1];
      if (slope > modulusCutoff && prevState === 1) nextState = 1;
      else if (slope < modulusCutoff && slope > 0 && strainValue > 0.015 && [0, 1].includes(prevState)) nextState = 2;
      else if (slope < modulusCutoff && prevState === 2) nextState = 2;
      else if (slope > modulusCutoff && prevState === 2 && stressSign > 0) nextState = 3;
      else if (slope > modulusCutoff && prevState === 3) nextState = 3;
      else if (slope > modulusCutoff && [2, 3].includes(prevState) && stressSign < 0) nextState = 4;
      else if (slope > modulusCutoff && prevState === 4) nextState = 4;
      else if (slope < modulusCutoff && prevState === 4) nextState = 5;
      else if (slope < modulusCutoff && prevState === 5) nextState = 5;
      else if (slope > modulusCutoff && prevState === 5 && stressSign < 0) nextState = 6;
      else if (slope > modulusCutoff && prevState === 5 && stressSign > 0) nextState = 7;
      else if (slope > modulusCutoff && prevState === 6 && stressSign < 0) nextState = 6;
      else if (slope > modulusCutoff && prevState === 6 && stressSign > 0) nextState = 7;
      else if (slope > modulusCutoff && prevState === 7) nextState = 7;
      else if (slope < modulusCutoff && prevState === 7 && strainValue < 0.08) nextState = 8;
      else if (slope < modulusCutoff && prevState === 8 && strainValue < 0.08) nextState = 8;
      else if (slope < modulusCutoff && prevState === 8 && strainValue > 0.08) nextState = 10;
      else if (slope > modulusCutoff && prevState === 8 && strainValue > 0.02) nextState = 9;
      else if (slope > modulusCutoff && prevState === 9 && strainValue > 0.02) nextState = 9;
      else if (slope < modulusCutoff && [9, 10].includes(prevState)) nextState = 10;
      states[index] = nextState;
      nonzeroStates[index] = nextState !== 0 ? nextState : nonzeroStates[index - 1];
    }
    if (states.length > 1) states[states.length - 1] = states[states.length - 2];
    return { states, modulus };
  }

  function seriesFromState(strain, stress, states, stateValue) {
    const x = [];
    const y = [];
    states.forEach((state, index) => {
      if (state === stateValue) {
        x.push(strain[index]);
        y.push(stress[index]);
      }
    });
    return { x, y };
  }

  function sortedSeriesAtOrAboveStrain(strain, stress, minimumStrain) {
    const pairs = [];
    strain.forEach((strainValue, index) => {
      const stressValue = stress[index];
      if (Number.isFinite(strainValue) && Number.isFinite(stressValue) && strainValue >= minimumStrain) {
        pairs.push([strainValue, stressValue]);
      }
    });
    pairs.sort((left, right) => (left[0] - right[0]) || (left[1] - right[1]));
    return {
      x: pairs.map((pair) => pair[0]),
      y: pairs.map((pair) => pair[1]),
    };
  }

  function sortedSeries(series) {
    const pairs = series.x.map((xValue, index) => [xValue, series.y[index]])
      .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
    pairs.sort((left, right) => (left[0] - right[0]) || (left[1] - right[1]));
    return {
      x: pairs.map((pair) => pair[0]),
      y: pairs.map((pair) => pair[1]),
    };
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }

  function interpPoints(x, y, count, start, end) {
    if (x.length < 2 || y.length < 2 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const xp = [];
    const yp = [];
    for (let index = 0; index < count; index += 1) {
      const target = count === 1 ? start : start + ((end - start) * index) / (count - 1);
      xp.push(target);
      let cursor = 0;
      while (cursor < x.length - 2 && x[cursor + 1] < target) cursor += 1;
      const x0 = x[cursor];
      const x1 = x[Math.min(cursor + 1, x.length - 1)];
      const y0 = y[cursor];
      const y1 = y[Math.min(cursor + 1, y.length - 1)];
      yp.push(Math.abs(x1 - x0) < 1e-18 ? y0 : y0 + ((target - x0) / (x1 - x0)) * (y1 - y0));
    }
    return { x: xp, y: yp };
  }

  function formatNumeric(value) {
    return Number.isFinite(value) ? value : null;
  }

  function buildParameterRows(params, plasticPoints, globalSettings) {
    const values = {
      "Austenite elasticity (MPa)": params.austenite_modulus,
      "Austenite Poisson’s ratio": 0.33,
      "Martensite elasticity (MPa)": params.martensite_modulus,
      "Martensite Poisson’s ratio": 0.33,
      "Transformation strain": params.transformation_strain,
      "ds/dT for loading (MPa/°C)": globalSettings.dsig_dt_loading_mpa_per_c,
      "Start transformation loading (MPa)": params.upper_plateau_start,
      "End transformation loading (MPa)": params.upper_plateau_end,
      "Reference temperature (°C)": globalSettings.reference_temperature_c,
      "ds/dT for unloading (MPa/°C)": globalSettings.dsig_dt_unloading_mpa_per_c,
      "Start transformation unloading (MPa)": params.lower_plateau_start,
      "End transformation unloading (MPa)": params.lower_plateau_end,
      "Start transform stress compression (MPa)": params.compression_start_stress,
      "Volumetric transformation strain": 0.0,
      "Number of annealing steps": 0.0,
      "Number of stress-strain points for plasticity": globalSettings.plastic_pair_count,
    };
    for (let pointIndex = 1; pointIndex <= 10; pointIndex += 1) {
      const stressKey = `Stress ${pointIndex} in yield curve (MPa)`;
      const strainKey = `Strain ${pointIndex} in yield curve`;
      if (plasticPoints && pointIndex <= plasticPoints.x.length) {
        values[stressKey] = plasticPoints.y[pointIndex - 1];
        values[strainKey] = plasticPoints.x[pointIndex - 1];
      } else {
        values[stressKey] = null;
        values[strainKey] = null;
      }
    }
    return Object.fromEntries(ABAQUS_PROPERTY_ROWS.map((name) => [name, formatNumeric(values[name])]));
  }

  function scoreFit(params, lineFits, plasticPoints, states) {
    let score = 0.0;
    [
      "Austenite elasticity (MPa)",
      "Martensite elasticity (MPa)",
      "Transformation strain",
      "Start transformation loading (MPa)",
      "End transformation loading (MPa)",
      "Start transformation unloading (MPa)",
      "End transformation unloading (MPa)",
    ].forEach((name) => {
      if (params[name] === null || params[name] === undefined) score += 1000.0;
    });
    if (!plasticPoints) score += 500.0;
    if (params["Austenite elasticity (MPa)"] !== null && params["Austenite elasticity (MPa)"] <= 0) score += 1000.0;
    if (params["Martensite elasticity (MPa)"] !== null && params["Martensite elasticity (MPa)"] <= 0) score += 1000.0;
    const upperStart = params["Start transformation loading (MPa)"];
    const upperEnd = params["End transformation loading (MPa)"];
    const lowerStart = params["Start transformation unloading (MPa)"];
    const lowerEnd = params["End transformation unloading (MPa)"];
    if (upperStart !== null && upperEnd !== null && upperEnd < upperStart) score += 400.0;
    if (lowerStart !== null && lowerEnd !== null && lowerStart < lowerEnd) score += 400.0;
    Object.values(lineFits).forEach((fit) => {
      if (fit) score += fit.mse;
    });
    score += Math.max(0, 5 - uniqueSorted(states).length) * 50.0;
    return score;
  }

  function stateSegmentPayload(trueStrain, trueStress, states) {
    return uniqueSorted(states).map((stateValue) => ({
      state: stateValue,
      name: STATE_NAMES[stateValue] || `State ${stateValue}`,
      x: trueStrain.filter((_, index) => states[index] === stateValue),
      y: trueStress.filter((_, index) => states[index] === stateValue),
    }));
  }

  function trace(name, x, y, options) {
    const tracePayload = {
      type: "scatter",
      name,
      mode: options.mode,
      x,
      y,
      visible: options.visible === undefined ? true : options.visible,
    };
    if (options.mode.includes("lines")) {
      tracePayload.line = { color: options.color, width: 2.5 };
      if (options.line_dash) tracePayload.line.dash = options.line_dash;
    }
    if (options.mode.includes("markers")) {
      tracePayload.marker = { color: options.color, size: 7 };
    }
    return tracePayload;
  }

  function buildChartSpec(label, rawTrueStrain, rawTrueStress, lineFits, plateauLines, plasticPoints, stateSegments, plasticBounds) {
    const traces = [
      trace("Raw tensile data", rawTrueStrain.slice(), rawTrueStress.slice(), { mode: "lines", color: "#cbd5e1" }),
    ];
    const colorMap = {
      austenite_loading: "#6d28d9",
      martensite_unloading: "#7c3aed",
      martensite_loading_cycle2: "#5b21b6",
      upper_plateau: "#2563eb",
      lower_plateau: "#d97706",
    };
    Object.entries(lineFits).forEach(([key, fit]) => {
      if (fit) traces.push(trace(key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()), fit.x, fit.y_fit, { mode: "lines", color: colorMap[key], line_dash: "dot" }));
    });
    Object.entries(plateauLines).forEach(([key, fit]) => {
      if (fit) traces.push(trace(key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()), fit.x, fit.y_fit, { mode: "lines", color: colorMap[key] }));
    });
    if (plasticPoints) traces.push(trace("Plastic interpolation points", plasticPoints.x, plasticPoints.y, { mode: "markers", color: "#16a34a" }));
    stateSegments.forEach((segment) => traces.push(trace(segment.name, segment.x, segment.y, { mode: "markers", color: "#64748b", visible: "legendonly" })));
    const shapes = [];
    if (plasticBounds[0] !== null && plasticBounds[0] !== undefined) {
      shapes.push({ type: "line", x0: plasticBounds[0], x1: plasticBounds[0], y0: 0, y1: 1, xref: "x", yref: "paper", line: { color: "#16a34a", dash: "dash" } });
    }
    if (plasticBounds[1] !== null && plasticBounds[1] !== undefined) {
      shapes.push({ type: "line", x0: plasticBounds[1], x1: plasticBounds[1], y0: 0, y1: 1, xref: "x", yref: "paper", line: { color: "#16a34a", dash: "dash" } });
    }
    return {
      data: traces,
      layout: {
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        xaxis: { title: { text: "True strain" }, zeroline: false },
        yaxis: { title: { text: "True stress (MPa)" }, zeroline: false },
        margin: { l: 72, r: 28, t: 24, b: 128 },
        legend: {
          orientation: "h",
          x: 0,
          xanchor: "left",
          y: -0.24,
          yanchor: "top",
        },
        shapes,
      },
      config: { responsive: true, displaylogo: false },
    };
  }

  function sanitizeWindow(window) {
    let candidate = Number.parseInt(window, 10);
    if (!Number.isFinite(candidate)) return 5;
    if (candidate < 3) candidate = 3;
    if (candidate % 2 === 0) candidate += 1;
    return candidate;
  }

  function fitForWindow(parsed, globalSettings, window, config) {
    const trueStressRaw = parsed.true_stress_raw;
    const trueStrainRaw = parsed.true_strain_raw;
    const trueStress = movingAverage(trueStressRaw, window);
    const trueStrain = movingAverage(trueStrainRaw, window);
    const { states, modulus } = segmentCurve(trueStrain, trueStress, Number(globalSettings.modulus_cutoff), window);
    const lineFits = {
      austenite_loading: null,
      martensite_unloading: null,
      martensite_loading_cycle2: null,
    };
    const plateauLines = { upper_plateau: null, lower_plateau: null };
    const fitMaskX = [];
    const fitMaskY = [];
    states.forEach((state, index) => {
      if (state === 1 && modulus[index] > Number(globalSettings.modulus_cutoff)) {
        fitMaskX.push(trueStrain[index]);
        fitMaskY.push(trueStress[index]);
      }
    });
    if (fitMaskX.length) lineFits.austenite_loading = linearFit(fitMaskX, fitMaskY);
    const state4 = seriesFromState(trueStrain, trueStress, states, 4);
    lineFits.martensite_unloading = linearFit(state4.x, state4.y);
    const state9 = seriesFromState(trueStrain, trueStress, states, 9);
    lineFits.martensite_loading_cycle2 = linearFit(state9.x, state9.y);
    const state2 = seriesFromState(trueStrain, trueStress, states, 2);
    plateauLines.upper_plateau = linearFit(state2.x, state2.y);
    const state5 = seriesFromState(trueStrain, trueStress, states, 5);
    plateauLines.lower_plateau = linearFit(state5.x, state5.y);

    const warnings = [];
    const params = {
      austenite_modulus: lineFits.austenite_loading ? lineFits.austenite_loading.slope : null,
      martensite_modulus: lineFits.martensite_unloading ? lineFits.martensite_unloading.slope : null,
    };
    const inverseFitSource = state9.x.length >= 2 ? lineFits.martensite_loading_cycle2 : lineFits.martensite_unloading;
    if (inverseFitSource) {
      const invFit = linearFit(inverseFitSource.y, inverseFitSource.x);
      params.transformation_strain = invFit ? invFit.intercept : null;
    } else {
      params.transformation_strain = null;
    }
    if (plateauLines.upper_plateau && state2.x.length) {
      params.upper_plateau_start = plateauLines.upper_plateau.slope * Math.min(...state2.x) + plateauLines.upper_plateau.intercept;
      params.upper_plateau_end = plateauLines.upper_plateau.slope * Math.max(...state2.x) + plateauLines.upper_plateau.intercept;
    } else {
      params.upper_plateau_start = null;
      params.upper_plateau_end = null;
      warnings.push("Could not determine the forward transformation plateau from the detected state sequence.");
    }
    if (plateauLines.lower_plateau && state5.x.length) {
      params.lower_plateau_start = plateauLines.lower_plateau.slope * Math.max(...state5.x) + plateauLines.lower_plateau.intercept;
      params.lower_plateau_end = plateauLines.lower_plateau.slope * Math.min(...state5.x) + plateauLines.lower_plateau.intercept;
    } else {
      params.lower_plateau_start = null;
      params.lower_plateau_end = null;
      warnings.push("Could not determine the reverse transformation plateau from the detected state sequence.");
    }
    params.compression_start_stress = params.upper_plateau_start !== null ? params.upper_plateau_start * 1.5 : null;

    const state10 = sortedSeries(seriesFromState(trueStrain, trueStress, states, 10));
    const fallbackPlasticSeries = sortedSeriesAtOrAboveStrain(trueStrain, trueStress, MIN_PLASTIC_TRUE_STRAIN);
    const plasticSource = state10.x.length >= 2 ? state10 : fallbackPlasticSeries;
    if (state10.x.length < 2 && fallbackPlasticSeries.x.length >= 2) {
      warnings.push("Plastic state could not be identified cleanly. Using high-strain data above 0.07 engineering strain for plastic interpolation.");
    }
    const plasticStartOverride = config.plastic_start_override_engineering_strain;
    const plasticEndOverride = config.plastic_end_override_engineering_strain;
    const hasStartOverride = hasNumericOverride(plasticStartOverride);
    const hasEndOverride = hasNumericOverride(plasticEndOverride);
    const enforcePlasticBounds = config.enforce_plastic_bounds === true;
    const rawPlasticStart = hasStartOverride
      ? Math.log1p(Number(plasticStartOverride))
      : (plasticSource.x.length ? Math.min(...plasticSource.x) : null);
    const rawPlasticEnd = hasEndOverride
      ? Math.log1p(Number(plasticEndOverride))
      : (plasticSource.x.length ? Math.max(...plasticSource.x) : null);
    const plasticStart = Number.isFinite(rawPlasticStart) ? Math.max(rawPlasticStart, MIN_PLASTIC_TRUE_STRAIN) : null;
    const plasticEnd = Number.isFinite(rawPlasticEnd) ? rawPlasticEnd : null;
    let plasticPoints = null;
    if (plasticStart !== null && plasticEnd !== null && plasticSource.x.length >= 2) {
      const stateMin = Math.min(...plasticSource.x);
      const stateMax = Math.max(...plasticSource.x);
      const interpolationStart = enforcePlasticBounds ? plasticStart : Math.max(plasticStart, stateMin);
      const interpolationEnd = enforcePlasticBounds ? plasticEnd : Math.min(plasticEnd, stateMax);
      if (enforcePlasticBounds && (plasticStart < stateMin || plasticEnd > stateMax)) {
        warnings.push("Shared plastic range extends beyond this dataset's detected plastic state; interpolation uses the boundary trend.");
      }
      plasticPoints = interpPoints(plasticSource.x, plasticSource.y, Number(globalSettings.plastic_pair_count), interpolationStart, interpolationEnd);
      if (!plasticPoints) warnings.push("Plastic-region interpolation did not converge for the selected range.");
    } else {
      warnings.push("Plastic state could not be identified cleanly. Review or override the plastic range.");
    }

    const parameterRows = buildParameterRows(params, plasticPoints, globalSettings);
    const score = scoreFit(parameterRows, { ...lineFits, ...plateauLines }, plasticPoints, states);
    if (parameterRows["Austenite elasticity (MPa)"] === null) warnings.push("Austenite elastic region fit is incomplete.");
    if (parameterRows["Martensite elasticity (MPa)"] === null) warnings.push("Martensite elastic region fit is incomplete.");
    const stateSegments = stateSegmentPayload(trueStrain, trueStress, states);
    return {
      score,
      parameter_rows: parameterRows,
      warnings,
      state_segments: stateSegments,
      chart_spec: buildChartSpec(parsed.label || "Dataset", trueStrainRaw, trueStressRaw, lineFits, plateauLines, plasticPoints, stateSegments, [plasticStart, plasticEnd]),
      plastic_points: plasticPoints,
      plastic_bounds_true_strain: plasticStart !== null && plasticEnd !== null ? [plasticStart, plasticEnd] : null,
      plastic_bounds_engineering_strain: plasticStart !== null && plasticEnd !== null ? [trueToEngineeringStrain(plasticStart), trueToEngineeringStrain(plasticEnd)] : null,
      diagnostics: {
        present_states: uniqueSorted(states),
        state_names: Object.fromEntries(Object.entries(STATE_NAMES).map(([key, value]) => [String(key), value])),
        score,
      },
      moving_average_window_selected: window,
      derived_inputs: {
        sheet_name: parsed.sheet_name,
        stress_column: parsed.stress_column,
        strain_column: parsed.strain_column,
        stress_unit_source: parsed.stress_unit_source,
        strain_unit_source: parsed.strain_unit_source,
        preview_rows: parsed.preview_rows,
      },
    };
  }

  function fitParsedDataset(parsed, datasetConfig, globalSettingsOverrides) {
    const globalSettings = sanitizeSettings(globalSettingsOverrides);
    const fixedWindow = sanitizeWindow(globalSettings.moving_average_window_points);
    const mode = String(globalSettings.moving_average_mode || "fixed").trim().toLowerCase();
    const testedWindows = [];
    let chosenWindow = fixedWindow;
    let chosenFit = null;
    if (mode === "optimize") {
      let candidateWindows = MOVING_AVERAGE_CANDIDATES.filter((window) => window < parsed.true_stress_raw.length - 2);
      if (!candidateWindows.includes(fixedWindow) && fixedWindow < parsed.true_stress_raw.length - 2) {
        candidateWindows = Array.from(new Set([fixedWindow, ...candidateWindows])).sort((a, b) => a - b);
      }
      const fits = [];
      candidateWindows.forEach((window) => {
        try {
          const fit = fitForWindow(parsed, globalSettings, window, datasetConfig);
          testedWindows.push({ window, status: "ok", score: fit.score });
          fits.push([window, fit]);
        } catch (error) {
          testedWindows.push({ window, status: "error", detail: error.message || String(error) });
        }
      });
      if (fits.length) {
        fits.sort((left, right) => (left[1].score - right[1].score) || (left[0] - right[0]));
        const bestScore = fits[0][1].score;
        const withinBand = fits.filter((item) => Math.abs(item[1].score - bestScore) <= Math.max(bestScore * 0.02, 1e-6));
        withinBand.sort((left, right) => left[0] - right[0]);
        [chosenWindow, chosenFit] = withinBand[0];
      } else {
        chosenWindow = 5;
        chosenFit = fitForWindow(parsed, globalSettings, chosenWindow, datasetConfig);
        testedWindows.push({ window: chosenWindow, status: "fallback", score: chosenFit.score });
      }
    } else {
      chosenFit = fitForWindow(parsed, globalSettings, chosenWindow, datasetConfig);
      testedWindows.push({ window: chosenWindow, status: "fixed", score: chosenFit.score });
    }
    const status = chosenFit.warnings.length ? "partial" : "ok";
    return {
      status,
      warnings: chosenFit.warnings,
      fit_parameters: chosenFit.parameter_rows,
      state_segments: chosenFit.state_segments,
      chart_spec: chosenFit.chart_spec,
      plastic_bounds_true_strain: chosenFit.plastic_bounds_true_strain,
      plastic_bounds_engineering_strain: chosenFit.plastic_bounds_engineering_strain,
      derived_inputs: chosenFit.derived_inputs,
      moving_average_window_selected: chosenWindow,
      diagnostics: {
        ...chosenFit.diagnostics,
        tested_windows: testedWindows,
        selected_window: chosenWindow,
        moving_average_mode: mode,
      },
      config: {
        file_id: datasetConfig.file_id,
        label: datasetConfig.label || parsed.label,
        file_name: datasetConfig.file_name || parsed.file_name,
        sheet_name: chosenFit.derived_inputs.sheet_name,
        available_sheets: datasetConfig.available_sheets || [],
        available_columns: parsed.available_columns,
        stress_column: chosenFit.derived_inputs.stress_column,
        strain_column: chosenFit.derived_inputs.strain_column,
        stress_unit_source: chosenFit.derived_inputs.stress_unit_source,
        strain_unit_source: chosenFit.derived_inputs.strain_unit_source,
        ignore_leading_rows: Number.parseInt(datasetConfig.ignore_leading_rows || 0, 10),
        plastic_start_override_engineering_strain: datasetConfig.plastic_start_override_engineering_strain ?? null,
        plastic_end_override_engineering_strain: datasetConfig.plastic_end_override_engineering_strain ?? null,
        enforce_plastic_bounds: datasetConfig.enforce_plastic_bounds === true,
        preview_rows: chosenFit.derived_inputs.preview_rows,
      },
    };
  }

  function mean(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function sampleStd(values) {
    if (!values.length) return null;
    if (values.length === 1) return 0.0;
    const avg = mean(values);
    const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  function buildResultsTable(datasets) {
    const columns = ["Property", ...datasets.map((dataset) => dataset.config.label), "Average", "Std Dev"];
    const rows = ABAQUS_PROPERTY_ROWS.map((propertyName) => {
      const values = datasets.map((dataset) => dataset.fit_parameters[propertyName]);
      const numericValues = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
      return [propertyName, ...values, mean(numericValues), sampleStd(numericValues)];
    });
    return { columns, rows };
  }

  return {
    DEFAULT_GLOBAL_SETTINGS,
    MOVING_AVERAGE_CANDIDATES,
    MIN_PLASTIC_ENGINEERING_STRAIN,
    STATE_NAMES,
    ABAQUS_PROPERTY_ROWS,
    slug,
    toFiniteNumber,
    sanitizeSettings,
    normalizeUnits,
    movingAverage,
    movingSlope,
    linearFit,
    segmentCurve,
    fitParsedDataset,
    buildResultsTable,
  };
});
