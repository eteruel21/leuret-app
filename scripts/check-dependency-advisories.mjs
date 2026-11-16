import { readFileSync } from "node:fs";

function highRiskAdvisories(path) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities) {
    throw new Error("No se recibió un informe válido de npm audit.");
  }

  const advisories = new Map();
  for (const { via } of Object.values(report.vulnerabilities)) {
    for (const advisory of via) {
      if (advisory.severity === "high" || advisory.severity === "critical") {
        advisories.set(advisory.source, advisory);
      }
    }
  }
  return advisories;
}

const [baseReport, headReport] = process.argv.slice(2);
const base = highRiskAdvisories(baseReport);
const head = highRiskAdvisories(headReport);
const introduced = [...head.values()].filter((advisory) => !base.has(advisory.source));

for (const advisory of introduced) {
  console.error(`${advisory.name} (${advisory.severity}): ${advisory.title} — ${advisory.url}`);
}
if (introduced.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`Sin avisos nuevos de gravedad alta o crítica. Avisos presentes: ${head.size}.`);
}
