import { formatPrintLabel } from "../matcher/print-candidate.mjs";

function formatScanResults(results = []) {
    if (!results.length) {
        return "No scan results.";
    }

    const rows = results.map((result, index) => {
        const name = result?.name || "Unknown card";
        const sets =
            Array.isArray(result?.sets) && result.sets.length
                ? result.sets.join(", ")
                : "No set match";
        const printings = Array.isArray(result?.printings) ? result.printings : [];
        const printingLine = printings.length
            ? `\n   Printings: ${printings
                  .map(
                      (printing) =>
                          `${formatPrintLabel(printing)}${printing.verified ? " (verified)" : " (unverified)"}`
                  )
                  .join(", ")}`
            : "";
        return `${index + 1}. ${name}\n   Sets: ${sets}${printingLine}`;
    });

    return `Scan results\n\n${rows.join("\n\n")}`;
}

export { formatScanResults };

export default formatScanResults;
