# Workspace Navigation Consolidation Design

## Goal

Use the workspace tab bar as the single authoritative way to move between open ADIA workspaces. Remove the duplicate diagram-mode switcher from the main header and correct lower-tab activation for V-Lab and X-Bridges.

## Current behavior and root cause

The application exposes two navigation bars with overlapping responsibilities:

- The header diagram-mode switcher calls mode-specific navigation and also synchronizes a workspace file tab.
- The workspace tab bar switches directly by workspace file ID.

These paths maintain related state through different functions. The header path changes the diagram mode before synchronizing a file, while the workspace path loads the selected file and then changes the mode. This duplication can let the active mode, active file, and visible workspace diverge, most noticeably for V-Lab and X-Bridges.

## Selected approach

Remove the header diagram-mode switcher and retain `WorkspaceTabBar` as the visible navigation control. A workspace-tab click will continue to identify its target by file ID and will use one activation path that:

1. saves the current file state;
2. resolves the selected workspace file;
3. loads that file's state;
4. sets the diagram mode from the selected file type; and
5. updates the active file ID.

V-Lab and X-Bridges use this same path. Their stored node and edge data must be loaded before their workspace becomes active. Switching to either must not create a new file or duplicate an existing tab.

## Alternatives considered

### Keep and synchronize both bars

This preserves both controls but leaves two navigation concepts and requires continued bidirectional state synchronization. It has the highest risk of future state drift.

### Keep the header as a read-only mode indicator

This avoids competing click handlers but retains duplicated labels and consumes header space without adding useful functionality.

### Use only the workspace tab bar

This is the selected approach. It matches the preferred interaction, removes duplication, and makes file identity the source of truth for workspace activation.

## Scope

Included:

- remove the header diagram-mode switcher;
- preserve the lower workspace tab bar and its active/close/open controls;
- correct V-Lab and X-Bridges activation from existing lower tabs;
- preserve activation of State Machine, SysML, HIL, and ENTROPY workspaces;
- add regression coverage for the consolidated behavior.

Excluded:

- redesigning the workspace tab appearance;
- changing the workspace asset manager;
- changing model contents or simulation behavior;
- removing programmatic navigation used by model-explorer or export workflows.

## Error and edge-case behavior

- Clicking an unknown or stale file ID must leave the current workspace unchanged.
- Clicking the active tab must be idempotent and must not reset its model state.
- Clicking an already-open V-Lab or X-Bridges tab must activate it rather than create another file.
- Closing the active tab continues to select the neighboring tab, with the existing State Machine fallback when no tabs remain.

## Verification

Automated regression tests will verify:

- the header no longer renders the duplicate diagram-mode switcher;
- clicking an existing V-Lab tab loads its data and activates V-Lab;
- clicking an existing X-Bridges tab loads its data and activates X-Bridges;
- switching among ordinary workspace tabs still updates active styling and content;
- tab closing and fallback behavior remain intact;
- no duplicate workspace file or tab is created during activation.

Relevant existing tests will be run alongside the new focused regression tests, followed by a build or type-check appropriate to the project scripts.
