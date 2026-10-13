# Engineering Knowledge Base and Source Ingestion Engine

## Goal

Give the X-Bridges agent a searchable, provenance-aware engineering background built from approved Simulink documentation, model repositories, and curated design references without executing untrusted external artifacts.

## Architecture

The system will extend the existing file-backed `PatternStore`, quarantine ingestion pipeline, source policy, and runtime verified-pattern gateway. A source registry will track official documentation, File Exchange, GitHub, and future sources. A fetcher will collect metadata and raw references, not execute downloaded scripts or callbacks. Extracted candidates will be normalized into engineering patterns, validated against the current X-Bridges catalog, simulated, and promoted only after review.

The first version will use the existing content-addressed JSON store rather than adding a database dependency. The store can later be backed by SQLite/Postgres without changing the normalized pattern or retrieval interfaces.

## Safety and licensing

- External content is quarantined by default.
- Source URL, author, license, retrieval time, and source hash are mandatory.
- Unlicensed or unclear content remains metadata-only and cannot become executable.
- MATLAB scripts, Simulink callbacks, archives, and foreign model files are never executed during ingestion.
- Only catalog-compatible, simulation-proved, human-reviewed patterns become `verified`.
- Catalog fingerprints invalidate stale verified patterns when block/port definitions change.

## Initial source seed

Seed official Simulink documentation, Model Finder guidance, Model Reference guidance, MATLAB Central File Exchange, and GitHub Simulink search as source records. The registry stores links and retrieval policy; it does not claim ownership of external model content.

## Success criteria

The agent can list and search source records, ingest a safe normalized candidate into quarantine, reject unsafe or incomplete candidates, validate and prove compatible patterns, promote reviewed patterns, and retrieve only verified patterns during planning.

