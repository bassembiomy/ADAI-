# Desktop Security Engineering Guidelines

When writing, refactoring, or reviewing code for this offline desktop application, strictly implement and enforce the following security requirements:

## 1. Offline-First & Network Isolation
- **Zero External Calls**: Do not implement any telemetry, remote logging, analytics, crash reporting, or external web requests.
- **Localhost Binding**: If local IPC or an embedded server/bridge is required, bind strictly to loopback (`127.0.0.1` / `localhost`). Reject and drop any non-loopback network interfaces or external network bindings.
- **Manual Update Channels**: Do not auto-fetch updates from remote endpoints. All patches/updates must be processed locally via signed update files.

## 2. Local Data Storage & File Handling
- **No Hardcoded Secrets**: Never embed plain-text API keys, internal server URIs, cryptographic keys, or credentials in source files.
- **Data at Rest Protection**: Encrypt sensitive user configurations, local databases (e.g., SQLite), and proprietary project files using standard industry algorithms (e.g., AES-256-GCM / DPAPI).
- **Safe File Operations & Path Validation**:
  - Canonicalize and validate all file paths to eliminate Path Traversal (`../`) vulnerabilities.
  - Write temporary data strictly to standard user-scoped temporary directories (`%LOCALAPPDATA%`, `AppData/Local`, or OS-equivalent temp paths).
  - Ensure temporary or intermediate files are securely flushed and wiped on application exit.

## 3. Least Privilege & OS Integration
- **Standard User Execution**: Design the application to run under standard user permissions. Do not mandate administrative/elevated privileges (Run as Administrator / sudo) unless interacting with a verified hardware/driver interface.
- **Input Validation & Safe Parsing**: Validate schemas, file headers, and binary formats strictly before processing to prevent buffer overflow, deserialization exploits, or memory corruption.
- **Safe Process Execution**: Prevent command injection. Never invoke shell execution via raw string concatenation; use parameterized process execution APIs (e.g., `ProcessStartInfo` with explicit `ArgumentList` or safe subprocess invocation).

## 4. Build, Compilation & Integrity
- **Binary Hardening**: Ensure build scripts/project configurations enable modern memory protection flags (ASLR, DEP/NX, Stack Canaries/SafeSEH).
- **Dependency Hygiene**: Prohibit unverified third-party libraries. Flag any outdated dependencies with known CVEs.
- **Obfuscation & Integrity Readiness**: Structure codebase to support post-build code signing and symbol stripping/obfuscation for core business logic.
