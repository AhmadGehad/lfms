# Development Rules

## Required Tools

Always use these tools for every task:

- **Caveman** — All communication must use caveman mode (compressed, token-efficient). Active every response. Code blocks and commits written normally.
- **Graphify** — Use for any codebase questions, architecture exploration, file relationships, or "how does X work?" queries. Build/query the knowledge graph before making architectural decisions.
- **Awesome Claude Code Subagents** — Delegate to specialized subagents in `.claude/agents/` for complex tasks. Use the appropriate subagent from the 10 categories (core-development, language-specialists, infrastructure, quality-security, data-ai, developer-experience, specialized-domains, business-product, meta-orchestration, research-analysis).

## Workflow

Before implementing any feature:

1. Search for relevant skills.
2. Use graphify to understand existing architecture and file relationships.
3. Create architecture before coding.
4. Review existing code before modifying.
5. Reuse existing components and services.
6. Delegate to specialized subagents when task complexity warrants it.
7. Run code review after implementation (use caveman-review or quality-security subagents).
8. Run security review before finalizing (use quality-security subagents).

Never:
- Create duplicate APIs.
- Create duplicate services.
- Create duplicate database tables.
- Create duplicate business logic.
- Skip graphify when architecture questions arise.
- Use verbose communication instead of caveman mode.
