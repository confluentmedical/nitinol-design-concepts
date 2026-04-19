(function (root, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AbaqusMatpropsExport = factory();
  }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  function workbookArrayBuffer(payload) {
    if (typeof XLSX === "undefined") {
      throw new Error("SheetJS is not loaded. XLSX export is unavailable.");
    }
    const workbook = XLSX.utils.book_new();
    const summaryRows = [payload.results_table.columns, ...payload.results_table.rows];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "summary_table");
    const diagnosticsRows = [["Dataset", "Selected Window", "Mode", "Warnings"]];
    payload.datasets.forEach((dataset) => {
      diagnosticsRows.push([
        dataset.config.label,
        dataset.moving_average_window_selected,
        dataset.diagnostics.moving_average_mode,
        (dataset.warnings || []).join(" | "),
      ]);
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(diagnosticsRows), "diagnostics");
    return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  }

  function downloadSummaryWorkbook(payload) {
    const buffer = workbookArrayBuffer(payload);
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "abaqus_matprops_summary.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return {
    workbookArrayBuffer,
    downloadSummaryWorkbook,
  };
});
