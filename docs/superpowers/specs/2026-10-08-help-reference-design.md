# ADIA Help reference design

Approved in chat on 2026-10-08: a MATLAB-style reference organization with ADIA's own theme.

The Help dialog provides documentation, an element/relationship reference and the live block catalog. Diagram chapters explain purpose, creation, symbols, connections, worked examples and execution limits. Element pages provide authored usage/examples and property tables grounded in the current inspector schema. Block pages preserve runtime-specific equations, port identities, defaults, bounds and worked examples.

Navigation includes full-text search, page contents, related topics and clear selected states. All Help surfaces, controls and SVG diagrams use the application's theme contract in dark and light modes. Generated workspace-control topics remain searchable without overwhelming the guide index.

Review every unresolved current-source handler against its implementation; preserve explicit exclusions for callback forwarding and event wrappers. No automatic generic fallback may turn unknown actions into documented actions. Verify live source fingerprints, registry equality, reference completeness, UI navigation and browser rendering. Existing unrelated workspace changes are preserved.
