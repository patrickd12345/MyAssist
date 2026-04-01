import { analyzeMyAssistEnv, formatEnvReadinessReport } from "../lib/env/envReadiness";

const productionLike = process.argv.includes("--production-like");
const r = analyzeMyAssistEnv(process.env, { productionLike });
console.log(formatEnvReadinessReport(r));
process.exit(r.passed ? 0 : 1);
