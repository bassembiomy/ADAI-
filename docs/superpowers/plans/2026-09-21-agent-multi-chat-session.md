# Agent Multi-Chat Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-memory, switchable ADIA Agent chats with isolated transcripts and engineering workflow state.

**Architecture:** `AgentPanel` owns an array of `AgentChatSession` records and an active session ID. Each session owns a dedicated `AgentOrchestrator`; shared tool and project dependencies are supplied through a factory so workflow state cannot leak between chats.

**Tech Stack:** React, TypeScript, Vitest, React DOM test utilities, existing `AgentOrchestrator` and `ToolGateway`.

## Global Constraints

- Chat history exists only for the current application session.
- Each chat has an isolated orchestrator, transcript, response cards, approvals, and workflow state.
- Project context and tool access remain shared dependencies.
- New-chat and switching controls are disabled while the active session is busy.
- Asynchronous results update the originating session by ID.
- No local storage, project-file persistence, deletion, renaming, search, or export.

---

### Task 1: Add a safe fresh-orchestrator factory

**Files:**
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/agent/agentOrchestrator.test.ts`

**Interfaces:**
- Produce `AgentOrchestrator.createFreshSession(): AgentOrchestrator`.
- The returned orchestrator shares provider/tool/pattern-loading dependencies and current project context but has no task, question, approval, plan, proof, transaction, or conversation state.

- [ ] **Step 1: Write a failing test** that starts a workflow on one orchestrator, calls `createFreshSession()`, verifies the new instance has the same project context/tool gateway, and verifies `getState()` throws because no task exists.
- [ ] **Step 2: Run `npx vitest run src/agent/agentOrchestrator.test.ts -t "fresh session"`** and confirm failure because the factory does not exist.
- [ ] **Step 3: Implement `createFreshSession()`** using the constructor dependencies already retained by the orchestrator, copy project context through `updateProjectContext`, and do not copy mutable workflow fields.
- [ ] **Step 4: Run `npx vitest run src/agent/agentOrchestrator.test.ts`** and confirm all orchestrator tests pass.
- [ ] **Step 5: Commit** with `git add src/agent/agentOrchestrator.ts src/agent/agentOrchestrator.test.ts && git commit -m "feat: create isolated agent workflow sessions"`.

### Task 2: Introduce the in-memory chat-session model

**Files:**
- Create: `src/components/agent/agentChatSessions.ts`
- Create: `src/components/agent/agentChatSessions.test.ts`
- Modify: `src/components/agent/AgentPanel.tsx`

**Interfaces:**
- Produce `AgentChatSession` with `id`, `title`, `createdAt`, `updatedAt`, `messages`, `currentResponse`, `orchestrator`, and `isBusy`.
- Produce `createAgentChatSession(orchestrator, now?): AgentChatSession`.
- Produce `deriveChatTitle(firstMessage, maxLength?): string`.
- Produce immutable `updateSessionById(sessions, id, updater)`.

- [ ] **Step 1: Write failing unit tests** for empty-session creation, deterministic title derivation, length limiting, and ID-targeted immutable updates.
- [ ] **Step 2: Run `npx vitest run src/components/agent/agentChatSessions.test.ts`** and confirm failure because the module is absent.
- [ ] **Step 3: Implement the pure session helpers** with a `New Chat` fallback title and no browser-storage calls.
- [ ] **Step 4: Replace panel-global `messages`, `currentResponse`, and `isBusy` state** with sessions plus active session ID; capture the active session ID at the start of send/approve/reject/simulate/undo handlers and update that session only.
- [ ] **Step 5: Run `npx vitest run src/components/agent/agentChatSessions.test.ts src/components/agent/AgentPanel.test.tsx`** and confirm helper and existing panel tests pass.
- [ ] **Step 6: Commit** with `git add src/components/agent/agentChatSessions.ts src/components/agent/agentChatSessions.test.ts src/components/agent/AgentPanel.tsx && git commit -m "feat: isolate agent state by chat session"`.

### Task 3: Add New Chat and history switching UI

**Files:**
- Modify: `src/components/agent/AgentPanel.tsx`
- Modify: `src/components/agent/AgentPanel.css`
- Modify: `src/components/agent/AgentPanel.test.tsx`

**Interfaces:**
- `New Chat` creates `activeSession.orchestrator.createFreshSession()`, appends a session, and selects it.
- History items select by session ID and render title plus last-activity metadata.

- [ ] **Step 1: Write failing component tests** asserting the New Chat control and history region render, creating a chat preserves the first session, and switching restores the corresponding transcript.
- [ ] **Step 2: Add a failing concurrency test** with a deferred orchestrator response proving a late result is appended to its originating session.
- [ ] **Step 3: Run `npx vitest run src/components/agent/AgentPanel.test.tsx`** and confirm the new assertions fail for missing UI/session behavior.
- [ ] **Step 4: Implement the header control and history list**, including active styling, accessible labels, deterministic ordering, and busy-state disabling.
- [ ] **Step 5: Add focused CSS** for compact history layout without changing unrelated panel tabs or cards.
- [ ] **Step 6: Run `npx vitest run src/components/agent/AgentPanel.test.tsx src/components/agent/agentChatSessions.test.ts`** and confirm all tests pass.
- [ ] **Step 7: Commit** with `git add src/components/agent/AgentPanel.tsx src/components/agent/AgentPanel.css src/components/agent/AgentPanel.test.tsx && git commit -m "feat: add in-session agent chat history"`.

### Task 4: Integrate and verify the complete feature

**Files:**
- Modify: only files required by confirmed integration failures
- Test: agent and component suites

- [ ] **Step 1: Run `npx vitest run src/agent src/components/agent`** and record any failures.
- [ ] **Step 2: Fix only confirmed session-factory or panel compatibility failures and add a regression test for each fix.**
- [ ] **Step 3: Run `npx tsc --noEmit --pretty false`** and confirm zero type errors.
- [ ] **Step 4: Run `git diff --check` and verify no browser storage APIs were added with `rg -n "localStorage|sessionStorage|indexedDB" src/components/agent src/agent`**.
- [ ] **Step 5: Commit any final integration fixes** with a focused message, leaving unrelated workspace changes untouched.

## Plan self-review

- Spec coverage: session creation, history, workflow isolation, shared dependencies, busy-state safety, asynchronous origin tracking, session-only lifetime, errors, and tests are covered.
- Placeholder scan: no deferred implementation instructions or undefined behavior remain.
- Type consistency: `createFreshSession`, `AgentChatSession`, `createAgentChatSession`, `deriveChatTitle`, and `updateSessionById` are introduced before use.
