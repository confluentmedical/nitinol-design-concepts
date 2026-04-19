(function (global) {
  "use strict";

  const STORAGE_KEY = "ndt.openStentCalculator.inputs.v1";
  const MMHG_PER_MPA = 7500.6;
  const MPA_PER_MMHG = 0.000133322368;
  const EPSILON = 1e-12;

  const DEFAULT_INPUTS = Object.freeze({
    N_col: 10,
    N_struts: 42,
    D_tube: 1.915,
    t_raw: 0.17,
    L_strut_inner: 1.2,
    w_apex_raw: 0.13,
    X_bridge: 0.15,
    Y_bridge: 0,
    w_bridge_raw: 0.125,
    N_bridges: 7,
    w_kerf: 0.025,
    m_width: 0.036,
    m_thickness: 0.059,
    Af: 27,
    E_Af_low: 94000,
    Af_low: -5,
    E_Af_high: 34000,
    Af_high: 37,
    Af_inflection: 19,
    density_niti: 6.7,
    strain_endurance: 0.004,
    D_set: 8,
    D_ves: 6.5,
    D: 6.5,
    C_percent: 0.06,
    C_pressure: 100,
    P_systolic: 150,
    P_diastolic: 50,
    P_mean: 100,
  });

  const FIELD_GROUPS = [
    {
      title: "Stent Geometry",
      kicker: "Tube and unit cell",
      fields: [
        ["N_col", "Columns", "#", 1, "Axial columns of repeating cells."],
        ["N_struts", "Struts around circumference", "#", 1, "Circumferential strut count. Even values are expected."],
        ["D_tube", "Raw tube OD", "mm", 0.001, "Outer diameter of the starting tube."],
        ["t_raw", "Raw wall thickness", "mm", 0.001, "Wall thickness before finishing."],
        ["L_strut_inner", "Strut length to inner tangents", "mm", 0.001, "Straight strut length between inner tangency points."],
        ["w_apex_raw", "Raw apex width", "mm", 0.001, "As-cut apex width before finishing removal."],
        ["X_bridge", "Bridge axial gap", "mm", 0.001, "Axial bridge spacing between adjacent cells."],
        ["Y_bridge", "Bridge circumferential span", "mm", 0.001, "Circumferential bridge span."],
        ["w_bridge_raw", "Raw bridge width", "mm", 0.001, "As-cut bridge width before finishing removal."],
        ["N_bridges", "Bridges around circumference", "#", 1, "Bridge count around the circumference."],
      ],
    },
    {
      title: "Process Parameters",
      kicker: "Laser and finishing",
      fields: [
        ["w_kerf", "Effective kerf width", "mm", 0.001, "Effective laser cut width in the crimped state."],
        ["m_width", "Feature width removal", "mm", 0.001, "Width removed during finishing operations."],
        ["m_thickness", "Wall thickness removal", "mm", 0.001, "Wall thickness removed during finishing."],
        ["Af", "Finished Af", "deg C", 0.1, "Finished austenite finish temperature."],
      ],
    },
    {
      title: "Material Properties",
      kicker: "Nitinol model",
      fields: [
        ["E_Af_low", "Modulus at low Af", "MPa", 100, "Upper austenite modulus anchor."],
        ["Af_low", "Low Af anchor", "deg C", 0.1, "Low Af value used for modulus interpolation."],
        ["E_Af_high", "Modulus at high Af", "MPa", 100, "Lower austenite modulus anchor."],
        ["Af_high", "High Af anchor", "deg C", 0.1, "High Af value used for modulus interpolation."],
        ["Af_inflection", "Af inflection", "deg C", 0.1, "Switch point between low-Af and high-Af modulus curves."],
        ["density_niti", "Nitinol density", "mg/mm^3", 0.01, "Density used for mass estimation."],
        ["strain_endurance", "Endurance limit", "strain", 0.0001, "Fatigue strain limit as a fraction. 0.004 equals 0.4%."],
      ],
    },
    {
      title: "Service Parameters",
      kicker: "Deployment and vessel",
      fields: [
        ["D_set", "Expanded stent ID", "mm", 0.001, "Free expanded inner diameter."],
        ["D_ves", "Vessel diameter", "mm", 0.001, "Nominal vessel diameter."],
        ["D", "Analysis diameter", "mm", 0.001, "Diameter used for primary constrained-strain calculation."],
        ["C_percent", "Compliance diameter change", "fraction", 0.001, "Diameter change fraction across the compliance pressure."],
        ["C_pressure", "Compliance pressure", "mmHg", 1, "Pressure corresponding to the compliance diameter change."],
        ["P_systolic", "Systolic pressure", "mmHg", 1, "Maximum pressure at implant site."],
        ["P_diastolic", "Diastolic pressure", "mmHg", 1, "Minimum pressure at implant site."],
        ["P_mean", "Mean pressure", "mmHg", 1, "Mean pressure at implant site."],
      ],
    },
  ];

  const RESULT_GROUPS = [
    {
      title: "Stent Dimension Calculations",
      keys: [
        ["N_cells", "Cells around circumference", "#", "number"],
        ["D_crimp", "Fully constrained OD", "mm", "number"],
        ["L_strut", "Effective strut length", "mm", "number"],
        ["w_strut_raw", "Raw strut width", "mm", "number"],
        ["w_strut", "Finished strut width", "mm", "number"],
        ["w_bridge", "Finished bridge width", "mm", "number"],
        ["w_apex", "Finished apex width", "mm", "number"],
        ["t", "Finished wall thickness", "mm", "number"],
      ],
    },
    {
      title: "Strut Angle and Deflection",
      keys: [
        ["theta_set", "Strut angle at full expansion", "deg", "number"],
        ["theta_d", "Strut angle at analysis diameter", "deg", "number"],
        ["delta_theta_d", "Change in angle", "deg", "number"],
        ["two_theta", "Maximum included angle", "deg", "number"],
        ["delta_d", "Strut deflection", "mm", "number"],
        ["theta_1mm", "Strut angle at 1 mm under set diameter", "deg", "number"],
        ["delta_theta_1mm", "Change in angle at 1 mm under set", "deg", "number"],
        ["delta_1mm", "Deflection at 1 mm under set", "mm", "number"],
      ],
    },
    {
      title: "Length, Surface, Volume, and Mass",
      keys: [
        ["X_cell_crimp", "Cell length in crimped state", "mm", "number"],
        ["X_total_crimp", "Stent length in crimped state", "mm", "number"],
        ["X_cell", "Cell length at analysis diameter", "mm", "number"],
        ["X_total", "Stent length at analysis diameter", "mm", "number"],
        ["FS", "Foreshortening", "%", "percent"],
        ["A_contact", "Outer contact area", "mm^2", "number"],
        ["A_cylinder", "Cylinder area occupied by stent", "mm^2", "number"],
        ["PCA", "Percentage coverage area", "%", "percent"],
        ["POA", "Percentage open area", "%", "percent"],
        ["V_total", "Total volume", "mm^3", "number"],
        ["mass", "Estimated mass", "mg", "number"],
      ],
    },
    {
      title: "Moment, Force, Pressure, and Stiffness",
      keys: [
        ["E", "Austenite modulus at specified Af", "MPa", "number"],
        ["I", "Moment of inertia", "mm^4", "scientific"],
        ["F_hoop", "Hoop component of strut force", "N", "number"],
        ["F_hoop_1mm", "Hoop component at 1 mm under set", "N", "number"],
        ["strain_d", "Max strain at analysis diameter", "%", "percent"],
        ["strain_1mm", "Max strain at 1 mm under set", "%", "percent"],
        ["RF_hoop", "Normalized resistive force, hoop", "N/cm", "number"],
        ["RF_trf", "Normalized resistive force, true radial", "N/cm", "number"],
        ["P_eq", "Equivalent outward pressure", "mmHg", "number"],
        ["P_contact", "Contact pressure", "kPa", "number"],
        ["k_stent", "Stent stiffness", "N/mm", "number"],
      ],
    },
    {
      title: "Vessel Interaction and Fatigue",
      keys: [
        ["k_vessel", "Vessel stiffness", "N/mm", "number"],
        ["D_vm", "Native vessel diameter at mean pressure", "mm", "number"],
        ["D_vd", "Native vessel diameter at diastolic pressure", "mm", "number"],
        ["D_vs", "Native vessel diameter at systolic pressure", "mm", "number"],
        ["D_bm", "Balanced diameter at mean pressure", "mm", "number"],
        ["D_bd", "Balanced diameter at diastolic pressure", "mm", "number"],
        ["D_bs", "Balanced diameter at systolic pressure", "mm", "number"],
        ["strain_vessel", "Strain at vessel diameter", "%", "percent"],
        ["strain_balanced", "Strain at balanced mean diameter", "%", "percent"],
        ["strain_diastolic", "Strain at diastolic pressure", "%", "percent"],
        ["strain_systolic", "Strain at systolic pressure", "%", "percent"],
        ["strain_mean", "Mean service strain", "%", "percent"],
        ["strain_amplitude", "Service strain amplitude", "%", "percent"],
        ["N_sf", "Fatigue safety factor", "#", "number"],
      ],
    },
  ];

  const PRIMARY_METRICS = [
    ["N_sf", "Fatigue safety factor", "#", "number"],
    ["strain_amplitude", "Strain amplitude", "%", "percent"],
    ["strain_mean", "Mean strain", "%", "percent"],
    ["strain_vessel", "Vessel strain", "%", "percent"],
    ["P_contact", "Contact pressure", "kPa", "number"],
    ["P_eq", "Equivalent pressure", "mmHg", "number"],
    ["RF_trf", "True radial force", "N/cm", "number"],
    ["FS", "Foreshortening", "%", "percent"],
    ["mass", "Mass", "mg", "number"],
  ];

  const SWEEP_OPTIONS = {
    vessel: {
      label: "Vessel and analysis diameter",
      keys: ["D_ves", "D"],
      start: 5.5,
      end: 7.75,
      step: 0.25,
      unit: "mm",
    },
    t_raw: {
      label: "Raw wall thickness",
      keys: ["t_raw"],
      start: 0.12,
      end: 0.22,
      step: 0.01,
      unit: "mm",
    },
    L_strut_inner: {
      label: "Strut length to inner tangents",
      keys: ["L_strut_inner"],
      start: 0.7,
      end: 1.6,
      step: 0.1,
      unit: "mm",
    },
    D_set: {
      label: "Expanded stent ID",
      keys: ["D_set"],
      start: 6,
      end: 10,
      step: 0.25,
      unit: "mm",
    },
    Af: {
      label: "Finished Af",
      keys: ["Af"],
      start: -5,
      end: 40,
      step: 5,
      unit: "deg C",
    },
  };

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function coerceInputs(rawInputs) {
    const inputs = {};
    Object.keys(DEFAULT_INPUTS).forEach((key) => {
      inputs[key] = toNumber(rawInputs && rawInputs[key], DEFAULT_INPUTS[key]);
    });
    return inputs;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeDiv(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < EPSILON) {
      return Number.NaN;
    }
    return numerator / denominator;
  }

  function asinDeg(value, warnings, label) {
    if (!Number.isFinite(value)) {
      warnings.push(`${label} could not be calculated because its geometry ratio is not finite.`);
      return Number.NaN;
    }
    if (value < -1 || value > 1) {
      warnings.push(`${label} geometry ratio ${value.toFixed(3)} is outside the arcsine domain [-1, 1]. Results are clipped for display.`);
    }
    return (180 / Math.PI) * Math.asin(clamp(value, -1, 1));
  }

  function modulusAtAf(inputs) {
    const E_case1 = inputs.E_Af_low;
    const E_case2 = inputs.E_Af_low - 1.9 * Math.pow(inputs.Af - inputs.Af_low, 3);
    const E_case3 = inputs.E_Af_high + 5.9 * Math.pow(inputs.Af_high - inputs.Af, 3);
    const E_case4 = inputs.E_Af_high;
    let E = E_case4;
    if (inputs.Af <= inputs.Af_low) {
      E = E_case1;
    } else if (inputs.Af < inputs.Af_inflection) {
      E = E_case2;
    } else if (inputs.Af < inputs.Af_high) {
      E = E_case3;
    }
    return { E_case1, E_case2, E_case3, E_case4, E };
  }

  function validateInputs(inputs) {
    const warnings = [];
    const positiveKeys = [
      "N_col",
      "N_struts",
      "D_tube",
      "t_raw",
      "L_strut_inner",
      "w_apex_raw",
      "w_bridge_raw",
      "w_kerf",
      "density_niti",
      "D_set",
      "D_ves",
      "D",
      "C_pressure",
    ];
    positiveKeys.forEach((key) => {
      if (!(inputs[key] > 0)) {
        warnings.push(`${key} should be greater than zero.`);
      }
    });
    if (Math.round(inputs.N_struts) % 2 !== 0) {
      warnings.push("N_struts is expected to be even because each cell uses two struts.");
    }
    if (inputs.N_bridges > 0 && Math.round(inputs.N_struts) % Math.round(inputs.N_bridges) !== 0) {
      warnings.push("N_bridges is usually a factor of N_struts for uniform bridge placement.");
    }
    if (inputs.t_raw - inputs.m_thickness <= 0) {
      warnings.push("Finished wall thickness is nonpositive. Reduce m_thickness or increase t_raw.");
    }
    if (inputs.w_bridge_raw - inputs.m_width <= 0) {
      warnings.push("Finished bridge width is nonpositive. Reduce m_width or increase w_bridge_raw.");
    }
    if (inputs.w_apex_raw - inputs.m_width <= 0) {
      warnings.push("Finished apex width is nonpositive. Reduce m_width or increase w_apex_raw.");
    }
    if (inputs.D_set <= inputs.D) {
      warnings.push("D_set should be greater than the analysis diameter to calculate stent stiffness.");
    }
    if (inputs.P_systolic <= inputs.P_diastolic) {
      warnings.push("P_systolic should be greater than P_diastolic for pulsatile fatigue calculations.");
    }
    if (inputs.strain_endurance <= 0) {
      warnings.push("strain_endurance should be positive for fatigue safety factor calculations.");
    }
    if (inputs.Af_low >= inputs.Af_inflection || inputs.Af_inflection >= inputs.Af_high) {
      warnings.push("Af_low, Af_inflection, and Af_high should increase in that order.");
    }
    return warnings;
  }

  function calculateOpenStent(rawInputs) {
    const inputs = coerceInputs(rawInputs || DEFAULT_INPUTS);
    const warnings = validateInputs(inputs);
    const outputs = {};
    const material = modulusAtAf(inputs);
    Object.assign(outputs, material);

    outputs.N_cells = inputs.N_struts / 2;
    outputs.D_crimp = inputs.D_tube;
    outputs.L_strut = inputs.L_strut_inner + inputs.w_apex_raw;
    outputs.w_strut_raw = safeDiv(inputs.D_tube * Math.PI, inputs.N_struts) - inputs.w_kerf;
    outputs.w_strut = outputs.w_strut_raw - inputs.m_width;
    outputs.w_bridge = inputs.w_bridge_raw - inputs.m_width;
    outputs.w_apex = inputs.w_apex_raw - inputs.m_width;
    outputs.t = inputs.t_raw - inputs.m_thickness;

    if (outputs.w_strut <= 0) {
      warnings.push("Finished strut width is nonpositive. Reduce m_width, kerf, or strut count.");
    }
    if (outputs.E <= 0) {
      warnings.push("Calculated modulus is nonpositive. Check material property anchors and Af.");
    }

    const thetaSetRatio = safeDiv((inputs.D_set * Math.PI - outputs.D_crimp * Math.PI) / inputs.N_struts, outputs.L_strut);
    const thetaDRatio = safeDiv((inputs.D * Math.PI - outputs.D_crimp * Math.PI) / inputs.N_struts, outputs.L_strut);
    const theta1mmRatio = safeDiv(((inputs.D_set - 1) * Math.PI - outputs.D_crimp * Math.PI) / inputs.N_struts, outputs.L_strut);
    outputs.theta_set = asinDeg(thetaSetRatio, warnings, "theta_set");
    outputs.theta_d = asinDeg(thetaDRatio, warnings, "theta_d");
    outputs.delta_theta_d = outputs.theta_set - outputs.theta_d;
    outputs.two_theta = 2 * outputs.theta_set;
    outputs.delta_d = 2 * outputs.L_strut * Math.sin((outputs.delta_theta_d * Math.PI / 180) / 2);
    outputs.theta_1mm = asinDeg(theta1mmRatio, warnings, "theta_1mm");
    outputs.delta_theta_1mm = outputs.theta_set - outputs.theta_1mm;
    outputs.delta_1mm = 2 * outputs.L_strut * Math.sin((outputs.delta_theta_1mm * Math.PI / 180) / 2);

    outputs.X_cell_crimp = inputs.L_strut_inner + 2 * (inputs.w_apex_raw + inputs.X_bridge / 2);
    outputs.X_total_crimp = outputs.X_cell_crimp * inputs.N_col - inputs.X_bridge;
    outputs.X_cell = inputs.L_strut_inner * Math.cos(outputs.theta_d * Math.PI / 180) + 2 * (inputs.w_apex_raw + inputs.X_bridge / 2);
    outputs.X_total = outputs.X_cell * inputs.N_col - inputs.X_bridge;
    outputs.FS = safeDiv(outputs.X_total_crimp - outputs.X_total, outputs.X_total_crimp);

    outputs.A_strut = (inputs.L_strut_inner - inputs.w_kerf) * outputs.w_strut;
    outputs.R_apex = outputs.w_strut + inputs.w_kerf / 2 + inputs.m_width / 2;
    outputs.A_apex =
      0.5 * Math.PI * (Math.pow(outputs.R_apex, 2) - Math.pow(outputs.R_apex - outputs.w_strut, 2)) +
      2 * (outputs.w_apex - outputs.w_strut) * outputs.R_apex;
    outputs.A_bridge = Math.sqrt(Math.pow(inputs.X_bridge, 2) + Math.pow(inputs.Y_bridge, 2)) * outputs.w_bridge;
    outputs.A_contact =
      (outputs.A_strut + outputs.A_apex) * inputs.N_struts * inputs.N_col +
      outputs.A_bridge * inputs.N_bridges * (inputs.N_col - 1);
    outputs.A_cylinder = Math.PI * inputs.D * outputs.X_total;
    outputs.PCA = safeDiv(outputs.A_contact, outputs.A_cylinder);
    outputs.POA = 1 - outputs.PCA;
    outputs.w_strut_id = safeDiv((inputs.D_tube - 2 * outputs.t) * Math.PI, inputs.N_struts) - inputs.w_kerf - inputs.m_width;
    outputs.A_strut_id = outputs.A_strut * safeDiv(outputs.w_strut_id, outputs.w_strut);
    outputs.A_apex_id = outputs.A_apex * safeDiv(outputs.w_strut_id, outputs.w_strut);
    outputs.A_bridge_id = outputs.A_bridge * safeDiv(outputs.w_strut_id, outputs.w_strut);
    outputs.V_strut = outputs.t * ((outputs.A_strut + outputs.A_strut_id) / 2);
    outputs.V_apex = outputs.t * ((outputs.A_apex + outputs.A_apex_id) / 2);
    outputs.V_bridge = outputs.t * ((outputs.A_bridge + outputs.A_bridge_id) / 2);
    outputs.V_total =
      (outputs.V_strut + outputs.V_apex) * inputs.N_struts * inputs.N_col +
      outputs.V_bridge * inputs.N_bridges * (inputs.N_col - 1);
    outputs.mass = inputs.density_niti * outputs.V_total;

    outputs.R = inputs.D_tube / 2;
    outputs.alpha = 0.5 * safeDiv(outputs.w_strut, inputs.D_tube * Math.PI) * 2 * Math.PI;
    outputs.I =
      Math.pow(outputs.R, 3) *
      outputs.t *
      (1 - (3 * outputs.t) / (2 * outputs.R) + Math.pow(outputs.t, 2) / Math.pow(outputs.R, 2) - Math.pow(outputs.t, 3) / (4 * Math.pow(outputs.R, 3))) *
      (outputs.alpha - Math.sin(outputs.alpha) * Math.cos(outputs.alpha));

    outputs.F_total = safeDiv(12 * outputs.E * outputs.I, Math.pow(outputs.L_strut, 3)) * outputs.delta_d;
    outputs.F_hoop = outputs.F_total;
    outputs.F_total_1mm = safeDiv(12 * outputs.E * outputs.I, Math.pow(outputs.L_strut, 3)) * outputs.delta_1mm;
    outputs.F_hoop_1mm = outputs.F_total_1mm;
    outputs.strain_d = safeDiv(3 * outputs.w_strut, Math.pow(outputs.L_strut, 2)) * outputs.delta_d;
    outputs.strain_1mm = safeDiv(3 * outputs.w_strut, Math.pow(outputs.L_strut, 2)) * outputs.delta_1mm;

    outputs.RF_hoop = safeDiv(outputs.F_hoop_1mm, outputs.X_cell) * 10;
    outputs.RF_trf = 2 * Math.PI * outputs.RF_hoop;
    outputs.P_eq = safeDiv(outputs.F_hoop, outputs.X_cell * (inputs.D / 2)) * MMHG_PER_MPA;
    outputs.P_contact = safeDiv(outputs.F_hoop * 2 * Math.PI * inputs.N_col, outputs.A_contact) * 1000;
    outputs.k_stent = safeDiv(outputs.F_hoop, inputs.D_set - inputs.D);

    outputs.CV_pressure = inputs.C_pressure * MPA_PER_MMHG;
    outputs.DV_low = inputs.D_ves;
    outputs.DV_high = inputs.D_ves * (1 + inputs.C_percent);
    outputs.FV_hoop = outputs.CV_pressure * (outputs.DV_high / 2) * outputs.X_cell;
    outputs.k_vessel = safeDiv(outputs.FV_hoop, outputs.DV_high - outputs.DV_low);

    outputs.D_vm = inputs.D_ves * (1 + inputs.C_percent * safeDiv(inputs.P_mean - inputs.C_pressure, inputs.C_pressure));
    outputs.D_vd = inputs.D_ves * (1 + inputs.C_percent * safeDiv(inputs.P_diastolic - inputs.C_pressure, inputs.C_pressure));
    outputs.D_vs = inputs.D_ves * (1 + inputs.C_percent * safeDiv(inputs.P_systolic - inputs.C_pressure, inputs.C_pressure));
    outputs.D_bm = safeDiv(outputs.k_stent * inputs.D_set + outputs.k_vessel * outputs.D_vm, outputs.k_stent + outputs.k_vessel);
    outputs.D_bd = safeDiv(outputs.k_stent * inputs.D_set + outputs.k_vessel * outputs.D_vd, outputs.k_stent + outputs.k_vessel);
    outputs.D_bs = safeDiv(outputs.k_stent * inputs.D_set + outputs.k_vessel * outputs.D_vs, outputs.k_stent + outputs.k_vessel);

    addBalancedDeflection(outputs, inputs, warnings, "mean", outputs.D_bm);
    addBalancedDeflection(outputs, inputs, warnings, "diastolic", outputs.D_bd);
    addBalancedDeflection(outputs, inputs, warnings, "systolic", outputs.D_bs);

    outputs.strain_vessel = outputs.strain_d;
    outputs.strain_balanced = safeDiv(3 * outputs.w_strut, Math.pow(outputs.L_strut, 2)) * outputs.delta_mean;
    outputs.strain_diastolic = safeDiv(3 * outputs.w_strut, Math.pow(outputs.L_strut, 2)) * outputs.delta_diastolic;
    outputs.strain_systolic = safeDiv(3 * outputs.w_strut, Math.pow(outputs.L_strut, 2)) * outputs.delta_systolic;
    outputs.strain_mean = (outputs.strain_diastolic + outputs.strain_systolic) / 2;
    outputs.strain_amplitude = Math.abs(outputs.strain_diastolic - outputs.strain_systolic) / 2;
    outputs.N_sf = safeDiv(inputs.strain_endurance, outputs.strain_amplitude);

    if (outputs.N_sf < 1) {
      warnings.push("Fatigue safety factor is below 1.0 for the current service assumptions.");
    } else if (outputs.N_sf < 2) {
      warnings.push("Fatigue safety factor is below 2.0. Treat this as an early design risk.");
    }
    return {
      inputs,
      outputs,
      warnings: Array.from(new Set(warnings)).filter(Boolean),
    };
  }

  function addBalancedDeflection(outputs, inputs, warnings, label, diameter) {
    const titleLabel = label === "mean" ? "theta_mean" : `theta_${label}`;
    const ratio = safeDiv((diameter * Math.PI - outputs.D_crimp * Math.PI) / inputs.N_struts, outputs.L_strut);
    outputs[titleLabel] = asinDeg(ratio, warnings, titleLabel);
    outputs[`delta_theta_${label}`] = outputs.theta_set - outputs[titleLabel];
    outputs[`delta_${label}`] = 2 * outputs.L_strut * Math.sin((outputs[`delta_theta_${label}`] * Math.PI / 180) / 2);
  }

  function formatValue(value, kind, decimals) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    if (kind === "percent") {
      return `${(value * 100).toFixed(decimals ?? 2)}%`;
    }
    if (kind === "scientific") {
      return value.toExponential(decimals ?? 3);
    }
    const absValue = Math.abs(value);
    if (absValue > 0 && absValue < 0.001) {
      return value.toExponential(decimals ?? 3);
    }
    return value.toLocaleString(undefined, {
      maximumFractionDigits: decimals ?? 3,
      minimumFractionDigits: 0,
    });
  }

  function runSensitivity(rawInputs, optionKey, start, end, step) {
    const option = SWEEP_OPTIONS[optionKey] || SWEEP_OPTIONS.vessel;
    const baseInputs = coerceInputs(rawInputs || DEFAULT_INPUTS);
    const rows = [];
    const safeStep = Math.abs(toNumber(step, option.step));
    if (!(safeStep > 0) || !Number.isFinite(start) || !Number.isFinite(end)) {
      return rows;
    }
    const direction = start <= end ? 1 : -1;
    const maxRows = 101;
    let current = start;
    for (let idx = 0; idx < maxRows; idx += 1) {
      if ((direction > 0 && current > end + EPSILON) || (direction < 0 && current < end - EPSILON)) {
        break;
      }
      const inputs = { ...baseInputs };
      option.keys.forEach((key) => {
        inputs[key] = current;
      });
      const result = calculateOpenStent(inputs);
      rows.push({
        x: current,
        unit: option.unit,
        N_sf: result.outputs.N_sf,
        strain_amplitude: result.outputs.strain_amplitude,
        strain_vessel: result.outputs.strain_vessel,
        P_contact: result.outputs.P_contact,
        RF_trf: result.outputs.RF_trf,
        warnings: result.warnings.length,
      });
      current += direction * safeStep;
    }
    return rows;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function inputElementId(key) {
    return `osc-input-${key}`;
  }

  function buildInputGroups(container, inputs) {
    container.innerHTML = FIELD_GROUPS.map((group) => {
      const fields = group.fields.map(([key, label, unit, step, help]) => `
        <label class="rd-field open-stent-field" for="${inputElementId(key)}">
          <span>${escapeHtml(label)}</span>
          <div class="open-stent-input-unit">
            <input id="${inputElementId(key)}" data-osc-input="${escapeHtml(key)}" name="${escapeHtml(key)}" type="number" step="${escapeHtml(step)}" value="${escapeHtml(inputs[key])}" />
            <em>${escapeHtml(unit)}</em>
          </div>
          <small>${escapeHtml(help)}</small>
        </label>
      `).join("");
      return `
        <section class="open-stent-input-card">
          <div>
            <p class="rd-kicker">${escapeHtml(group.kicker)}</p>
            <h3>${escapeHtml(group.title)}</h3>
          </div>
          <div class="rd-grid rd-grid-3">${fields}</div>
        </section>
      `;
    }).join("");
  }

  function collectInputs() {
    const raw = {};
    document.querySelectorAll("[data-osc-input]").forEach((input) => {
      raw[input.dataset.oscInput] = input.value;
    });
    return coerceInputs(raw);
  }

  function renderPrimaryMetrics(container, outputs) {
    container.innerHTML = PRIMARY_METRICS.map(([key, label, unit, kind]) => {
      const value = outputs[key];
      let state = "neutral";
      if (key === "N_sf") {
        state = value >= 2 ? "good" : value >= 1 ? "warning" : "danger";
      } else if (key.startsWith("strain")) {
        state = value <= 0.004 ? "good" : value <= 0.02 ? "warning" : "danger";
      }
      return `
        <article class="open-stent-metric ${state}">
          <span>${escapeHtml(label)}</span>
          <strong>${formatValue(value, kind, kind === "percent" ? 3 : 2)}</strong>
          <small>${escapeHtml(unit)}</small>
        </article>
      `;
    }).join("");
  }

  function renderWarnings(container, warnings) {
    if (!warnings.length) {
      container.innerHTML = '<div class="rd-pill">No validation warnings</div>';
      return;
    }
    container.innerHTML = `
      <h3>Validation Warnings</h3>
      <ul class="rd-warning-list">
        ${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
      </ul>
    `;
  }

  function renderResultGroups(container, outputs) {
    container.innerHTML = RESULT_GROUPS.map((group) => `
      <details class="open-stent-result-card" open>
        <summary>${escapeHtml(group.title)}</summary>
        <div class="rd-table-preview">
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Description</th>
                <th>Value</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              ${group.keys.map(([key, label, unit, kind]) => `
                <tr>
                  <td><code>${escapeHtml(key)}</code></td>
                  <td>${escapeHtml(label)}</td>
                  <td>${formatValue(outputs[key], kind)}</td>
                  <td>${escapeHtml(unit)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </details>
    `).join("");
  }

  function renderSweepOptions(select) {
    select.innerHTML = Object.entries(SWEEP_OPTIONS)
      .map(([key, option]) => `<option value="${escapeHtml(key)}">${escapeHtml(option.label)}</option>`)
      .join("");
  }

  function setSweepDefaults(optionKey) {
    const option = SWEEP_OPTIONS[optionKey] || SWEEP_OPTIONS.vessel;
    document.getElementById("osc-sweep-start").value = option.start;
    document.getElementById("osc-sweep-end").value = option.end;
    document.getElementById("osc-sweep-step").value = option.step;
  }

  function renderSensitivityTable(container, rows, option) {
    if (!rows.length) {
      container.innerHTML = '<div class="rd-muted">No sensitivity rows. Check start, end, and step.</div>';
      return;
    }
    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(option.label)} (${escapeHtml(option.unit)})</th>
            <th>Safety factor</th>
            <th>Strain amplitude</th>
            <th>Vessel strain</th>
            <th>Contact pressure (kPa)</th>
            <th>True radial force (N/cm)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${formatValue(row.x, "number", 3)}</td>
              <td>${formatValue(row.N_sf, "number", 2)}</td>
              <td>${formatValue(row.strain_amplitude, "percent", 3)}</td>
              <td>${formatValue(row.strain_vessel, "percent", 3)}</td>
              <td>${formatValue(row.P_contact, "number", 2)}</td>
              <td>${formatValue(row.RF_trf, "number", 2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderSensitivityChart(container, rows, option) {
    const finiteRows = rows.filter((row) => Number.isFinite(row.N_sf) && Number.isFinite(row.x));
    if (finiteRows.length < 2) {
      container.innerHTML = '<div class="rd-muted">At least two finite rows are required for the chart.</div>';
      return;
    }
    const width = 780;
    const height = 260;
    const margin = { top: 22, right: 24, bottom: 42, left: 52 };
    const xMin = Math.min(...finiteRows.map((row) => row.x));
    const xMax = Math.max(...finiteRows.map((row) => row.x));
    const yMinRaw = Math.min(0, ...finiteRows.map((row) => row.N_sf), 1);
    const yMaxRaw = Math.max(2, ...finiteRows.map((row) => row.N_sf), 1);
    const yPad = (yMaxRaw - yMinRaw) * 0.08 || 1;
    const yMin = yMinRaw;
    const yMax = yMaxRaw + yPad;
    const xScale = (x) => margin.left + safeDiv(x - xMin, xMax - xMin) * (width - margin.left - margin.right);
    const yScale = (y) => height - margin.bottom - safeDiv(y - yMin, yMax - yMin) * (height - margin.top - margin.bottom);
    const path = finiteRows.map((row, index) => `${index === 0 ? "M" : "L"}${xScale(row.x).toFixed(1)},${yScale(row.N_sf).toFixed(1)}`).join(" ");
    const thresholdY = yScale(1);
    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fatigue safety factor sensitivity">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" class="osc-chart-bg"></rect>
        <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" class="osc-chart-axis"></line>
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" class="osc-chart-axis"></line>
        <line x1="${margin.left}" y1="${thresholdY.toFixed(1)}" x2="${width - margin.right}" y2="${thresholdY.toFixed(1)}" class="osc-chart-threshold"></line>
        <text x="${width - margin.right}" y="${(thresholdY - 6).toFixed(1)}" text-anchor="end" class="osc-chart-label">Safety factor 1.0</text>
        <path d="${path}" class="osc-chart-line"></path>
        ${finiteRows.map((row) => `<circle cx="${xScale(row.x).toFixed(1)}" cy="${yScale(row.N_sf).toFixed(1)}" r="3" class="osc-chart-point"></circle>`).join("")}
        <text x="${margin.left}" y="16" class="osc-chart-title">Fatigue safety factor</text>
        <text x="${width / 2}" y="${height - 10}" text-anchor="middle" class="osc-chart-label">${escapeHtml(option.label)} (${escapeHtml(option.unit)})</text>
        <text x="${margin.left}" y="${height - margin.bottom + 18}" text-anchor="middle" class="osc-chart-label">${formatValue(xMin, "number", 2)}</text>
        <text x="${width - margin.right}" y="${height - margin.bottom + 18}" text-anchor="middle" class="osc-chart-label">${formatValue(xMax, "number", 2)}</text>
        <text x="${margin.left - 8}" y="${yScale(yMin).toFixed(1)}" text-anchor="end" class="osc-chart-label">${formatValue(yMin, "number", 1)}</text>
        <text x="${margin.left - 8}" y="${yScale(yMaxRaw).toFixed(1)}" text-anchor="end" class="osc-chart-label">${formatValue(yMaxRaw, "number", 1)}</text>
      </svg>
    `;
  }

  function updateSensitivity(inputs) {
    const optionKey = document.getElementById("osc-sweep-variable").value || "vessel";
    const option = SWEEP_OPTIONS[optionKey] || SWEEP_OPTIONS.vessel;
    const start = toNumber(document.getElementById("osc-sweep-start").value, option.start);
    const end = toNumber(document.getElementById("osc-sweep-end").value, option.end);
    const step = toNumber(document.getElementById("osc-sweep-step").value, option.step);
    const rows = runSensitivity(inputs, optionKey, start, end, step);
    renderSensitivityChart(document.getElementById("osc-sensitivity-chart"), rows, option);
    renderSensitivityTable(document.getElementById("osc-sensitivity-table"), rows, option);
  }

  function persistInputs(inputs) {
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(inputs));
    } catch (_) {
      // Browser privacy modes may disable storage; the calculator remains stateless.
    }
  }

  function loadInputs() {
    try {
      const stored = global.localStorage?.getItem(STORAGE_KEY);
      if (stored) {
        return coerceInputs(JSON.parse(stored));
      }
    } catch (_) {
      return { ...DEFAULT_INPUTS };
    }
    return { ...DEFAULT_INPUTS };
  }

  function updateAll({ persist = true } = {}) {
    const inputs = collectInputs();
    const result = calculateOpenStent(inputs);
    renderPrimaryMetrics(document.getElementById("osc-primary-metrics"), result.outputs);
    renderWarnings(document.getElementById("osc-warnings"), result.warnings);
    renderResultGroups(document.getElementById("osc-result-groups"), result.outputs);
    updateSensitivity(inputs);
    if (persist) {
      persistInputs(inputs);
    }
    return result;
  }

  function setInputValues(inputs) {
    Object.entries(inputs).forEach(([key, value]) => {
      const input = document.getElementById(inputElementId(key));
      if (input) {
        input.value = value;
      }
    });
  }

  function resultToCsv(result) {
    const lines = [["Section", "Variable", "Description", "Value", "Unit"]];
    FIELD_GROUPS.forEach((group) => {
      group.fields.forEach(([key, label, unit]) => {
        lines.push(["Input", key, label, result.inputs[key], unit]);
      });
    });
    RESULT_GROUPS.forEach((group) => {
      group.keys.forEach(([key, label, unit]) => {
        lines.push([group.title, key, label, result.outputs[key], unit]);
      });
    });
    return lines
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  function copySummary(result) {
    const summary = PRIMARY_METRICS.map(([key, label, unit, kind]) => `${label}: ${formatValue(result.outputs[key], kind)} ${unit}`).join("\n");
    if (global.navigator?.clipboard?.writeText) {
      return global.navigator.clipboard.writeText(summary);
    }
    const textarea = document.createElement("textarea");
    textarea.value = summary;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return Promise.resolve();
  }

  function downloadCsv(result) {
    const blob = new Blob([resultToCsv(result)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "open-stent-calculator-results.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function initialize() {
    const inputContainer = document.getElementById("osc-input-groups");
    if (!inputContainer) {
      return;
    }
    const inputs = loadInputs();
    buildInputGroups(inputContainer, inputs);
    const sweepSelect = document.getElementById("osc-sweep-variable");
    renderSweepOptions(sweepSelect);
    setSweepDefaults(sweepSelect.value || "vessel");
    let latestResult = updateAll({ persist: false });

    document.getElementById("osc-form").addEventListener("input", () => {
      latestResult = updateAll();
      document.getElementById("osc-status").textContent = "Updated";
    });
    document.getElementById("osc-reset").addEventListener("click", () => {
      setInputValues(DEFAULT_INPUTS);
      latestResult = updateAll();
      document.getElementById("osc-status").textContent = "Baseline restored";
    });
    document.getElementById("osc-copy").addEventListener("click", () => {
      copySummary(latestResult).then(() => {
        document.getElementById("osc-status").textContent = "Summary copied";
      }).catch(() => {
        document.getElementById("osc-status").textContent = "Copy failed";
      });
    });
    document.getElementById("osc-download").addEventListener("click", () => {
      downloadCsv(latestResult);
      document.getElementById("osc-status").textContent = "CSV downloaded";
    });
    sweepSelect.addEventListener("change", () => {
      setSweepDefaults(sweepSelect.value);
      latestResult = updateAll();
    });
    ["osc-sweep-start", "osc-sweep-end", "osc-sweep-step"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => {
        latestResult = updateAll({ persist: false });
      });
    });
  }

  const api = {
    DEFAULT_INPUTS,
    FIELD_GROUPS,
    RESULT_GROUPS,
    PRIMARY_METRICS,
    SWEEP_OPTIONS,
    calculateOpenStent,
    runSensitivity,
    formatValue,
  };

  global.OpenStentCalculator = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initialize);
  }
})(typeof window !== "undefined" ? window : globalThis);
