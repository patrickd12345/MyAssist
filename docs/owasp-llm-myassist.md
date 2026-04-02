# OWASP LLM Top 10 mapping (MyAssist)

Short mapping of [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) to MyAssist surfaces: MCP, connectors, assistant routes, and tool expansion.

## LLM01: Prompt injection

| Risk | Mitigation in MyAssist |
| --- | --- |
| Untrusted email/calendar text influences model output or tool selection | Assistant consumes **digests** and structured context; keep treating provider content as untrusted; avoid passing raw HTML into tool arguments. |
| MCP clients send malicious prompts | MCP `get_daily_context` is **read-only**; `execute_action` uses **approval tokens**, a narrow v1 allowlist (`complete_task` for listed Todoist ids), and bearer auth. |

## LLM02: Insecure output handling

| Risk | Mitigation |
| --- | --- |
| Model emits JSON that executes or leaks secrets | [`parseAssistantStructuredReply`](../apps/web/lib/assistantStructuredReply.ts) validates shape; **reject** context-shaped dumps via [`looksLikeContextDump`](../apps/web/lib/assistantStructuredReply.ts). |
| Downstream systems trust model output without validation | UI and APIs should treat **assistant output as suggestions**, not commands. |

## LLM03: Training data poisoning

| Risk | Mitigation |
| --- | --- |
| Third-party model or prompt store poisoned | Prefer pinned models / providers; pin prompt versions in eval fixtures; review golden tests on change. |

## LLM04: Model denial of service

| Risk | Mitigation |
| --- | --- |
| Large context or tool loops | Timeouts on assistant chat ([`ASSISTANT_CHAT_TIMEOUT_MS`](../apps/web/app/api/assistant/route.ts)); monitor `duration_ms` in `myassist_kpi_*` logs. |

## LLM05: Supply chain vulnerabilities

| Risk | Mitigation |
| --- | --- |
| Compromised npm packages | Lockfiles; periodic `pnpm audit`; minimal MCP dependencies. |

## LLM06: Sensitive information disclosure

| Risk | Mitigation |
| --- | --- |
| Logs contain PII | KPI events use **no message bodies** (see [product-kpis.md](product-kpis.md)). |
| MCP forwards context to external hosts | Operators must understand third-party retention; document in deployment notes. |

## LLM07: Insecure plugin design

| Risk | Mitigation |
| --- | --- |
| Over-broad MCP tools | **Read-only** context plus **approval-gated** `execute_action` (narrow schema; v1 Todoist complete only). |

## LLM08: Excessive agency

| Risk | Mitigation |
| --- | --- |
| Autonomous writes | v1 rules: **no** autonomous global reprioritization; **explicit** user confirmation for writes. |

## LLM09: Overreliance

| Risk | Mitigation |
| --- | --- |
| User trusts wrong briefing | Deterministic fallbacks when models fail; label `mode` on assistant responses (`ollama` vs `fallback`). |

## LLM10: Model theft

| Risk | Mitigation |
| --- | --- |
| API keys exfiltrated | Env-only secrets; never log tokens; rotate `MYASSIST_MCP_TOKEN` if leaked. |

## Review cadence

Revisit this mapping when adding: new MCP tools, new provider writes, or multi-tenant hosting.
