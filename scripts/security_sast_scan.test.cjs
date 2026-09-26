// scripts/security_sast_scan.test.cjs
// ============================================================================
// Unit tests for SAST Security Scanner integrity & suppression controls
// ============================================================================

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  scanCodebase,
  isExcludedFile,
  isAuditedException,
  DOCUMENTED_EXACT_EXCLUSIONS,
} = require('./security_sast_scan.cjs');

console.log('Running SAST Security Scanner Unit Tests...');

// ----------------------------------------------------------------------------
// Test 1: Arbitrary sast-ignore comments MUST NOT suppress findings
// ----------------------------------------------------------------------------
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sast-test-ignore-'));
  try {
    const maliciousFile = path.join(tempDir, 'unsafeModule.ts');
    fs.writeFileSync(
      maliciousFile,
      `// sast-ignore SEC-SAST-005: fake reason to bypass
const fn = new Function('return 42;');
`,
      'utf8'
    );

    const result = scanCodebase({ rootDir: tempDir, targetDirs: [tempDir] });
    assert.strictEqual(
      result.findings.length,
      1,
      'Arbitrary sast-ignore comment MUST NOT suppress new Function finding'
    );
    assert.strictEqual(
      result.findings[0].ruleId,
      'SEC-SAST-005',
      'Finding must be SEC-SAST-005'
    );
    console.log('✓ Test 1 Passed: Arbitrary sast-ignore comment cannot bypass scanner.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ----------------------------------------------------------------------------
// Test 2: Files with "generated" in their name are NOT broadly excluded
// ----------------------------------------------------------------------------
{
  assert.strictEqual(
    isExcludedFile('src/utils/stateMachineCodeGenerator.ts'),
    false,
    'stateMachineCodeGenerator.ts must NOT be excluded by substring'
  );
  assert.strictEqual(
    isExcludedFile('src/security/generatedCodeVerifier.cjs'),
    false,
    'generatedCodeVerifier.cjs must NOT be excluded by substring'
  );
  assert.strictEqual(
    isExcludedFile('src/utils/generatedCodeTestWorkspace.ts'),
    false,
    'generatedCodeTestWorkspace.ts must NOT be excluded by substring'
  );

  // Exact whitelisted runtime bundle IS excluded
  assert.strictEqual(
    isExcludedFile('src/generated/stateMachineRuntimeBundle.ts'),
    true,
    'Documented exact generated runtime bundle must be excluded'
  );

  console.log('✓ Test 2 Passed: Non-whitelisted generated files are scanned.');
}

// ----------------------------------------------------------------------------
// Test 3: Audited exception matches only safeCreateFunction in src/App.tsx
// ----------------------------------------------------------------------------
{
  const validContext = `
export function safeCreateFunction(params: string[], body: string): Function {
  return new Function(...params, body);
}
`;
  const invalidContext = `
export function arbitraryFunction(params: string[], body: string): Function {
  return new Function(...params, body);
}
`;

  assert.strictEqual(
    isAuditedException('SEC-SAST-005', 'src/App.tsx', 'new Function', validContext),
    true,
    'safeCreateFunction in src/App.tsx should be recognized as audited exception'
  );

  assert.strictEqual(
    isAuditedException('SEC-SAST-005', 'src/App.tsx', 'new Function', invalidContext),
    false,
    'Non-safeCreateFunction in src/App.tsx should NOT be suppressed'
  );

  assert.strictEqual(
    isAuditedException('SEC-SAST-005', 'src/other.ts', 'new Function', validContext),
    false,
    'safeCreateFunction in other files should NOT be suppressed'
  );

  assert.strictEqual(
    isAuditedException('SEC-SAST-004', 'src/App.tsx', 'child_process.exec()', validContext),
    false,
    'Other rules (e.g. command injection) should NOT be suppressed'
  );

  console.log('✓ Test 3 Passed: Audited exception matching is strictly bound.');
}

console.log('\nAll SAST Scanner unit tests passed successfully!');
