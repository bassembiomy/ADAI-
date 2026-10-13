# ADIA Engineering Knowledge Base

ADIA indexes engineering references as metadata first. External pages and model repositories are never executed during ingestion. Structured candidates enter quarantine, are checked against the active X-Bridges catalog, and require isolated simulation proof plus human review before they can influence runtime planning.

## Seed sources

- MathWorks Simulink documentation: https://www.mathworks.com/help/simulink/
- Simulink Model Finder: https://www.mathworks.com/help/simulink/model-finder.html
- Simulink Model Reference: https://www.mathworks.com/help/simulink/model-reference.html
- MATLAB Central File Exchange: https://www.mathworks.com/matlabcentral/fileexchange/
- Simulink File Exchange search: https://www.mathworks.com/matlabcentral/fileexchange/?term=simulink
- GitHub Simulink repository search: https://github.com/search?q=simulink&type=repositories

## Lifecycle

`quarantined` → `reviewed` → `verified` → `deprecated`

Only license-approved, catalog-compatible, proof-backed `verified` patterns are returned by runtime retrieval. Every promoted pattern stores its source URL, author, license, source hash, catalog fingerprint, engine run ID, measured time, and review information.

## Ingestion rules

- Metadata retrieval is bounded, timeout-limited, and HTML-sanitized.
- MATLAB scripts, Simulink callbacks, archives, and foreign binaries are not executed.
- Unclear licensing remains metadata-only.
- Catalog changes invalidate patterns whose fingerprint no longer matches.
- Failed proofs remain quarantined and must not be used by the planner.
