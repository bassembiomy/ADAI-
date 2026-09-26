# Agent Multi-Chat Session Design

## Goal

Allow users to create and switch between multiple ADIA Agent chats during the current application session while keeping each chat's conversation and engineering workflow state isolated.

## User experience

- The Agent panel header provides a **New Chat** action.
- The panel provides an in-session chat-history list ordered by most recent activity.
- A new chat opens immediately with an empty message area and a fresh agent workflow.
- Each chat receives a deterministic display title derived from its first user message, with a safe fallback such as `New Chat`.
- Selecting a history item restores that chat's messages, current response cards, specification, approvals, and workflow status.
- Chat history is held only in application memory. Reloading or closing ADIA clears it.
- Creating or switching chats is disabled while the active chat is executing an asynchronous operation.

## Architecture

Introduce an `AgentChatSession` model owned by `AgentPanel`:

- `id`: stable session identifier.
- `title`: generated display title.
- `createdAt` and `updatedAt`: ordering metadata.
- `messages`: chat transcript for the session.
- `currentResponse`: latest orchestrator response used by workflow cards.
- `orchestrator`: a dedicated `AgentOrchestrator` instance.
- `isBusy`: active-operation state.

`AgentPanel` stores a collection of sessions and an active session ID instead of global `messages`, `currentResponse`, and `isBusy` values. Sending, approving, rejecting, simulating, and undoing always resolve the active session once at the start of the operation and write results back by that captured session ID.

Each session receives its own orchestrator instance. This prevents requirement answers, pending approvals, task state, audit history, or inferred intent from crossing chat boundaries. Project-level services, tool gateways, and project context remain shared dependencies and are applied to every session orchestrator.

## Orchestrator creation

Add an orchestrator factory supplied by the parent or derived from the existing orchestrator configuration. The factory must create a fresh workflow instance with the same LLM provider, tool gateway, collaborators, and current project context. A new chat must not reuse the mutable workflow state of another session.

If the externally supplied orchestrator cannot be cloned safely, the public API should expose a focused method or factory for creating a sibling orchestrator with shared dependencies and fresh workflow state. The design must not serialize and restore private mutable orchestrator internals.

## State transitions

1. On panel initialization, create one empty session.
2. On first user message, derive and store the session title.
3. On New Chat, create a fresh orchestrator and empty session, then select it.
4. On chat selection, render the selected session without mutating any other session.
5. On asynchronous completion, update the session that initiated the operation, even if future UI behavior permits selection changes.
6. On application unmount or reload, allow all session data to disappear naturally; no local storage or project-file persistence is used.

## Concurrency and safety

New-chat and chat-switch actions are disabled while the active session is busy. Operation handlers also capture the originating session ID to prevent late asynchronous responses from appearing in another chat. Existing approval and transaction safety gates remain unchanged.

## Error handling

- A failed session creation leaves the current session selected and surfaces an agent-panel error.
- An invalid or stale active session ID falls back to the most recently updated session.
- Operation failures append an error message only to the originating session.
- Empty session titles use `New Chat`; titles are trimmed and length-limited for layout safety.

## Testing

- Creating a chat preserves the previous chat and selects an empty session.
- Switching restores the exact transcript and workflow cards.
- Requirement and approval state do not leak between sessions.
- First-message title generation is deterministic and length-limited.
- Busy sessions disable New Chat and switching.
- Late asynchronous completion updates its originating session.
- No browser storage API is called.
- Existing AgentPanel and orchestrator tests continue to pass.

## Scope boundaries

This feature does not add durable chat persistence, cross-device synchronization, chat deletion, renaming, search, export, or shared execution transactions across chats.
