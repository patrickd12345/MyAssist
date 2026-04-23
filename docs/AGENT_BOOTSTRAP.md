<!-- BEGIN:BOOKIJI-UMBRELLA-BOOTSTRAP:BKI-043B -->
# Bookiji Inc Agent Bootstrap (Read First)

Read this file first for every agent prompt in this child project.

1. Before any analysis, planning, coding, testing, or deployment work, read umbrella `agents.md` source at `{{UMBRELLA_AGENTS_PATH}}`.
2. Then read numbered standards from `{{UMBRELLA_STANDARDS_INDEX_PATH}}`.
3. If local guidance conflicts with umbrella rules, umbrella rules override local assumptions.
4. This product is part of the Bookiji Inc multi-product system; protect cross-product boundaries and do not perform cross-repo or cross-product changes unless explicitly required.
5. Passing local tests is required but is not sufficient proof of production correctness.
6. When relevant, inspect real deployment/config/auth/external-system behavior before claiming completion.
7. For secrets and production-like operations, follow the umbrella-approved secret handling path in `{{UMBRELLA_SECRETS_STANDARD_PATH}}`.
8. Do not claim a fix is complete without evidence appropriate to the defect type (tests, runtime checks, logs, integration proof, or deployment validation as applicable).
<!-- END:BOOKIJI-UMBRELLA-BOOTSTRAP:BKI-043B -->

## Project-Specific Notes

Add child-project-specific constraints here. They must not conflict with the mandatory bootstrap section above.
