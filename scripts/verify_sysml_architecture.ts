import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ArchitectureRuleId =
  | 'SYSML_ARCH_DIRECT_MUTATION'
  | 'SYSML_ARCH_UI_SEMANTIC_STORAGE'
  | 'SYSML_ARCH_SILENT_CREATION';

export interface ArchitectureViolation {
  ruleId: ArchitectureRuleId;
  filePath: string;
  line?: number;
  message: string;
  allowed?: boolean;
}

export interface CompatibilityAllowlistEntry {
  filePath: string;
  ruleId: ArchitectureRuleId;
  reason: string;
}

/**
 * Temporary compatibility allowlist for legacy UI/adapter code.
 * Task 14 of the SysML v1.6 implementation plan explicitly mandates:
 * "Empty the production architecture-guard allowlist"
 */
export const COMPATIBILITY_ALLOWLIST: CompatibilityAllowlistEntry[] = [
  {
    filePath: 'src/App.tsx',
    ruleId: 'SYSML_ARCH_DIRECT_MUTATION',
    reason: 'Temporary compatibility until Task 12 & Task 14 UI projection conversion',
  },
  {
    filePath: 'src/App.tsx',
    ruleId: 'SYSML_ARCH_UI_SEMANTIC_STORAGE',
    reason: 'Temporary compatibility until Task 12 & Task 14 UI projection conversion',
  },
  {
    filePath: 'src/components/sysml/BlockPropertiesEditor.tsx',
    ruleId: 'SYSML_ARCH_DIRECT_MUTATION',
    reason: 'Temporary compatibility until Task 8 property editor command refactor',
  },
  {
    filePath: 'src/services/sysmlPropertyUsageSync.ts',
    ruleId: 'SYSML_ARCH_DIRECT_MUTATION',
    reason: 'Temporary legacy sync helper until Task 7/8 command migration',
  },
  {
    filePath: 'src/services/sysmlPropertyRules.ts',
    ruleId: 'SYSML_ARCH_DIRECT_MUTATION',
    reason: 'Temporary legacy rule adapter until Task 8',
  },
  {
    filePath: 'src/services/sysmlCommandGateway.ts',
    ruleId: 'SYSML_ARCH_DIRECT_MUTATION',
    reason: 'Temporary legacy gateway mutations until Task 7 command dispatcher refactor',
  },
];

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function isAllowlisted(filePath: string, ruleId: ArchitectureRuleId): boolean {
  const normalized = normalizePath(filePath);
  return COMPATIBILITY_ALLOWLIST.some(
    entry => normalized.endsWith(normalizePath(entry.filePath)) && entry.ruleId === ruleId
  );
}

const DIRECT_MUTATION_REGEX =
  /\b(?:setBlocks|setParts|setConnectors|setRelationships|setRequirements|setVerificationCases)\s*\(|\b(?:[A-Za-z0-9_]*(?:model|state|sysml|store|repository)\.(?:blocks|parts|connectors|relationships|requirements|verificationCases))\s*\.push\s*\(/i;

const UI_SEMANTIC_STORAGE_REGEX =
  /useState\s*<\s*(?:readonly\s+)?(?:BlockData|PartData|RelationshipData|RequirementData|VerificationCaseData)\s*\[\]\s*>/;

const SILENT_CREATION_REGEX =
  /\b(?:createPlaceholderType|synthesizeMissingType)\b|synthesize missing type silently/i;

export function scanSourceForArchitectureViolations(
  source: string,
  filePath: string
): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (DIRECT_MUTATION_REGEX.test(line)) {
      violations.push({
        ruleId: 'SYSML_ARCH_DIRECT_MUTATION',
        filePath,
        line: lineNum,
        message: `Direct mutation of semantic array detected on line ${lineNum}: "${line.trim()}"`,
        allowed: isAllowlisted(filePath, 'SYSML_ARCH_DIRECT_MUTATION'),
      });
    }

    if (UI_SEMANTIC_STORAGE_REGEX.test(line)) {
      violations.push({
        ruleId: 'SYSML_ARCH_UI_SEMANTIC_STORAGE',
        filePath,
        line: lineNum,
        message: `UI component semantic state storage detected on line ${lineNum}: "${line.trim()}"`,
        allowed: isAllowlisted(filePath, 'SYSML_ARCH_UI_SEMANTIC_STORAGE'),
      });
    }

    if (SILENT_CREATION_REGEX.test(line)) {
      violations.push({
        ruleId: 'SYSML_ARCH_SILENT_CREATION',
        filePath,
        line: lineNum,
        message: `Silent type creation detected on line ${lineNum}: "${line.trim()}"`,
        allowed: isAllowlisted(filePath, 'SYSML_ARCH_SILENT_CREATION'),
      });
    }
  }

  return violations;
}

function collectSourceFiles(dir: string, fileList: string[] = []): string[] {
  if (!existsSync(dir)) return fileList;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'dist-electron' ||
      entry === '.git' ||
      entry === '.worktrees' ||
      entry === 'toolchains'
    ) {
      continue;
    }
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectSourceFiles(fullPath, fileList);
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.js') || entry.endsWith('.jsx')) &&
      !entry.endsWith('.d.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.spec.tsx') &&
      !entry.includes('architectureGuards') &&
      !entry.includes('verify_sysml_architecture')
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function verifySysmlArchitecture(rootDir: string): ArchitectureViolation[] {
  const srcDir = resolve(rootDir, 'src');
  const files = collectSourceFiles(srcDir);
  const allViolations: ArchitectureViolation[] = [];

  for (const file of files) {
    const rel = relative(rootDir, file);
    const content = readFileSync(file, 'utf-8');
    const violations = scanSourceForArchitectureViolations(content, rel);
    allViolations.push(...violations);
  }

  return allViolations;
}

// CLI execution
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(currentFile)) {
  const rootDir = process.cwd();
  console.log(`\nScanning SysML architecture in: ${rootDir}...`);
  const violations = verifySysmlArchitecture(rootDir);
  const unallowed = violations.filter(v => !v.allowed);
  const allowed = violations.filter(v => v.allowed);

  console.log(`Found ${violations.length} total architecture notices (${allowed.length} allowlisted, ${unallowed.length} unallowed).`);

  if (allowed.length > 0) {
    console.log(`\n--- Temporary Allowlisted Patterns (${allowed.length}) ---`);
    for (const a of allowed) {
      console.log(`  [ALLOWLISTED] ${a.ruleId} at ${a.filePath}:${a.line}`);
    }
  }

  if (unallowed.length > 0) {
    console.error(`\n\x1b[31m--- Unallowed Architecture Violations (${unallowed.length}) ---\x1b[0m`);
    for (const u of unallowed) {
      console.error(`  \x1b[31m[VIOLATION]\x1b[0m ${u.ruleId} in ${u.filePath}:${u.line} - ${u.message}`);
    }
    process.exit(1);
  }

  console.log('\n\x1b[32m[PASS]\x1b[0m SysML repository-first architecture guardrails verified cleanly.\n');
  process.exit(0);
}
