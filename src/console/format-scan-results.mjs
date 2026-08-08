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
        return `${index + 1}. ${name}\n   Sets: ${sets}`;
    });

    return `Scan results\n\n${rows.join("\n\n")}`;
}

export { formatScanResults };

export default formatScanResults;
