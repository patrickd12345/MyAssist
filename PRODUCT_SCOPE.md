# Product Technical Scope

Product: MyAssist  
Type: AI assistant

## Platform Standards Applicability

| Capability | Status | Notes |
|------------|--------|------|
| AI Runtime | Applicable | AI execution is a core product surface and uses shared runtime patterns. |
| Stripe Runtime | N/A | No billing or Stripe webhook surface is part of this product scope. |
| CI Baseline | Partial | CI exists, but baseline enforcement is still limited and web-scoped. |
| Env Contract | Partial | Canonical env work exists, but alias handling and validation are not complete. |
| Observability | Partial | Logging helpers exist, but observability is not applied across all API paths. |
| Feature Flags | Partial | Env-driven toggles exist, but flag governance is not standardized. |
| Error Contract | Partial | Canonical error handling exists, but adoption is still limited to part of the API surface. |

## Architecture Intent

Assistant-focused product with AI runtime in scope and no billing surface.

## Out of Scope

- Stripe and billing architecture
- Payment webhook recommendations
- Marketplace or subscription design

## Audit Instructions

Future audit agents must:

- Read this file first
- Treat N/A as intentional
- Treat Partial as real gaps
- Avoid proposing out-of-scope architecture
