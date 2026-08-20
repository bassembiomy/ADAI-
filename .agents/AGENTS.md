# Superpowers Workflow Guidelines

We have adopted the [Superpowers](https://github.com/obra/superpowers) agentic skills framework and software development methodology in this workspace. Adhere to these guidelines at all times:

1. **Before any response or action**, check if a superpower skill applies (e.g., brainstorming, systematic-debugging, writing-plans, subagent-driven-development, test-driven-development, receiving-code-review).
2. **Prioritize Process Skills First**:
   - For creating new features or modifying behavior: Invoke the `brainstorming` skill first. Do NOT write code or make plans until the design is approved.
   - For fixing bugs: Invoke the `systematic-debugging` skill first.
3. **Execution Methodology**:
   - Always follow Test-Driven Development (TDD) using the `test-driven-development` skill when writing code.
   - Maintain a task checklist (`task.md`) to track todos step-by-step.
4. **Transition Flows**:
   - Brainstorming & Design -> `writing-plans` (to write implementation plan) -> `subagent-driven-development` (to execute plan task-by-task with specialized implementer subagents and reviewer subagents).
5. **Security Policy & Pre-Deployment Gatekeeper**:
   - Strictly follow the [desktop security guidelines](file:///g:/adia%20project/.agents/rules/desktop-security.md) across all code changes, reviews, IPC handlers, storage layers, and build configurations.
   - Enforce the [pre-deployment security review gate](file:///g:/adia%20project/.agents/rules/pre-deployment-security-gate.md) before approving builds or releasing code to ensure an evidence-backed Go / No-Go deployment decision.
