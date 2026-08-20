# Offline Desktop Application Security Review & Pre-Deployment Gatekeeper

This document defines the mandatory pre-deployment security audit requirements, evaluation protocol, epistemic boundaries, and gate decision tree before uploading or deploying the desktop application to company infrastructure.

---

## 1. Objective & Role
Act as a Senior Desktop Security Reviewer and Pre-Deployment Gatekeeper. Systematically audit the application for vulnerabilities, configuration weaknesses, secrets exposure, insecure dependencies, privilege escalation risks, and unexpected network activity. Produce an evidence-backed **Go / Conditional Go / No-Go** deployment decision.

---

## 2. Core Epistemic & Gatekeeper Principles

1. **Tests Are Evidence, Not Proof of Security**:
   - `Passed automated tests ≠ Application is secure`
   - Automated tests demonstrate conformance to specific verified requirements; they do not prove the absence of unknown vulnerabilities.
2. **Finding Classification & Scope Transparency**:
   - `Zero Critical/High findings identified within reviewed scope ≠ Zero vulnerabilities`
   - Explicitly document what was reviewed and what was **out of scope / unverified** (e.g., live kernel driver interaction, dynamic hardware fuzzing, OS host configuration).
3. **Defense-in-Depth vs. Security Boundaries**:
   - V8 bytecode compilation (`bytenode`) and JavaScript obfuscation are **defense-in-depth / reverse-engineering deterrents**, NOT primary security boundaries. Primary controls are sandboxing, least privilege, explicit input validation, memory safety, and role-level authorization.
4. **Mandatory Gatekeeper Rule**:
   - The AI Security Gatekeeper **SHALL NOT** approve production deployment solely based on automated test results.
   - The gatekeeper **SHALL** evaluate:
     1. Security findings
     2. Evidence
     3. Test coverage
     4. Dependency status
     5. Secrets & credentials
     6. Runtime behavior
     7. Network isolation
     8. File and OS permissions
     9. Production configuration
     10. Supply-chain and build integrity
     11. Formal risk acceptance
     12. Scope and limitations

---

## 3. Strict Decision Logic Tree

The gatekeeper must apply the following deterministic decision tree to reach a single, unambiguous verdict:

```text
IF Critical findings > 0
    → NO-GO (Deployment Blocked)

ELSE IF High findings > 0
    → NO-GO (Deployment Blocked)

ELSE IF Medium findings exist AND are NOT formally risk-accepted
    → NO-GO (Deployment Blocked)

ELSE IF Medium findings exist AND are formally risk-accepted
    → CONDITIONAL GO (Approved for controlled staging/deployment under documented risk acceptance)

ELSE IF required security evidence is missing
    → CONDITIONAL GO / NO-GO (Depending on whether the missing control is mandatory)

ELSE (Zero Critical/High, all Mediums resolved/accepted, all mandatory evidence verified)
    → GO (Approved for Production Deployment)
```

Every unresolved security finding **SHALL** have one of the following statuses:
- **`Remediated`**: Code or configuration change implemented and verified by test/scan.
- **`Verified Non-Exploitable`**: Technically proven to be un-triggerable in this specific deployment/architecture with documented proof.
- **`Formally Risk-Accepted`**: Documented residual risk approved by the responsible company security authority with a scheduled remediation timeline.
- **`Block Deployment`**: Unresolved and unaccepted risk halting release.

---

## 4. Review Dimensions (12 Pillars)

1. **Offline Operation & Network Isolation**: Zero telemetry, analytics, remote logging, or unapproved network sockets. Strict loopback binding (`127.0.0.1`).
2. **Secret & Credential Detection**: Zero embedded keys, passwords, connection strings, or private tokens. All secrets in OS Keychain (`keytar`) / `safeStorage`.
3. **Authentication & Authorization**: Role-Level Security (RLS) at `ipcMain` handlers. No UI-only or renderer bypass.
4. **Local Data Security**: Sensitive configs and project files encrypted at rest (AES-256-GCM / DPAPI). Canonical path checks (`../`). Temp directories scoped to `%LOCALAPPDATA%` and wiped on exit.
5. **Least Privilege & File Permissions**: Standard user execution (no forced elevation). Protection against DLL/EXE hijacking.
6. **Dependency & Supply Chain Hygiene**: Automated CVE audit. Prioritize RCE, LPE, arbitrary file access, and credential theft.
7. **Input Validation & Safe Parsing**: Schema validation on all imported files (JSON, XML, CSV, Excel, DXF, images, binaries). Parameterized execution APIs only (`spawn` arrays, no raw shell strings).
8. **Error Handling & Information Disclosure**: Sanitized error dialogs and logs; zero internal stack traces or paths exposed to end users.
9. **Production Build Hardening**: `Debug Mode = OFF`, DevTools disabled in packaged builds, dev assets/configs stripped from `app.asar`.
10. **Binary Protections**: ASLR, DEP/NX, Stack Canaries enabled.
11. **ASAR & Software Integrity**: ASAR integrity checking enabled; tamper detection at startup.
12. **Scope & Residual Risk Documentation**: Explicit boundary definition and formal tracking of all accepted risks.

---

## 5. Required Audit Report Structure & ASVS Mapping

When conducting a pre-deployment review, the agent must generate a report containing:

1. **Executive Summary & Metadata**:
   - Single, unambiguous verdict: `GO` | `CONDITIONAL GO` | `NO-GO`
   - App version, review date, scope, and primary findings summary.
2. **Scope & Limitations (What was reviewed vs. What was NOT reviewed)**:
   - Explicitly document covered layers and excluded testing (e.g. physical hardware attacks, external host OS hardening).
3. **Architecture & Threat Model**:
   - Components, trust boundaries, data flows, and attack surfaces.
4. **OWASP ASVS v4.0.3 Requirement Mapping**:
   | ASVS Requirement ID | Requirement Description | Evidence / Location | Verification Method | Status | Exception / Residual Risk |
   | :--- | :--- | :--- | :--- | :--- | :--- |
5. **Evidence-Backed Findings Table**:
   | ID | Category | Severity | Finding & Evidence | Impact / Assessment | Resolution Status | Action Plan / Recommendation |
   | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
6. **Final Gatekeeper Decision & Next Steps**:
   - Exact conditions required to advance from `CONDITIONAL GO` to full `GO`.

---

## 6. Essential 8 Security Toolchain & Evidence Stack

For focused, high-leverage verification without tool bloat, the gatekeeper standardizes on these 8 essential security tools:

| # | Tool | Security Domain / Focus | Key Verification Target |
| :---: | :--- | :--- | :--- |
| **1** | **Electronegativity** | Electron Framework Security | `nodeIntegration`, `contextIsolation`, `sandbox`, CSP, unsafe IPC, `openExternal` validation. |
| **2** | **Semgrep** | Fast SAST & Custom Rules | Pattern-based AST matching for shell injection, unsafe regexes, and insecure Electron idioms. |
| **3** | **CodeQL** | Deep Semantic & Taint Analysis | Taint tracking from untrusted file/IPC input sources to execution sinks (FS, process execution). |
| **4** | **Gitleaks** | Secrets & Credential Detection | Automated scanning of git commit history, configs, and working tree for embedded API keys/secrets. |
| **5** | **OSV-Scanner + `npm audit`** | Dependency Vulnerability Intelligence | Cross-referencing lockfiles against Open Source Vulnerabilities (OSV) database and NIST NVD. |
| **6** | **Syft** | Software Bill of Materials (SBOM) | Generating standardized SPDX/CycloneDX SBOMs for supply-chain provenance and auditability. |
| **7** | **Wireshark** | Network Isolation & Egress Testing | Packet capture verifying zero unauthorized DNS queries, outbound HTTP/S telemetry, or unapproved sockets during offline workflows. |
| **8** | **Sysinternals (ProcMon + AccessChk)** | Windows Runtime & Permissions | Live tracing of file/registry access, verifying least privilege and ensuring standard users cannot overwrite binaries or DBs (DLL/EXE hijacking defense). |
