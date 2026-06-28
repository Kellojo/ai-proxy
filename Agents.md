# Subagent Guidelines

## When to Use Subagents
- Exploring the codebase or understanding unfamiliar code
- Multi-step feature implementations
- Parallelizable tasks (run multiple subagents simultaneously)
- Any task that would consume significant context window

## Best Practices
- Provide detailed, self-contained instructions so the agent can work independently
- Specify expected output format and verification steps
- Prefer `explore` agents for code discovery, `general` agents for implementation
- Run independent subagents in parallel when possible
- Keep context clean by never implementing features yourself

