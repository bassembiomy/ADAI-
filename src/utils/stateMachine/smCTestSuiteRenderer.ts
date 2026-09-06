import { toCIdentifier } from './smExpressions';
import type { SMCStandard } from './smModel';
import type {
  SemanticIOMapping,
  SemanticModel,
  SemanticState,
} from './smSemanticModel';
import {
  serializeSMTestManifest,
  type SMTestCase,
  type SMTestExpectation,
  type SMTestManifest,
  type SMTestOperation,
  type SMTestSuite,
} from './smTestManifest';
import { renderCTestRuntimeFiles } from './smCTestRuntimeRenderer';
import type { GeneratedCFile } from './smCGenerator';

export interface CTestSuiteRenderOptions {
  standard?: SMCStandard;
}

const assertNever = (value: never): never => {
  throw new Error(`Unhandled discriminated union case: ${JSON.stringify(value)}`);
};

const resolveStateEnum = (ir: SemanticModel, stateId: string): string => {
  const st = ir.states[stateId];
  if (st && st.enumName) return st.enumName;
  return `SM_ST_${toCIdentifier(stateId).toUpperCase()}`;
};

const resolveStateIndex = (ir: SemanticModel, stateId: string): string => {
  const states = Object.values(ir.states).sort((a, b) => a.activityIndex - b.activityIndex);
  const idx = states.findIndex((s) => s.id === stateId);
  return idx >= 0 ? String(idx + 1) : '1';
};

const renderOperation = (
  ir: SemanticModel,
  op: SMTestOperation,
): string => {
  switch (op.kind) {
    case 'init':
      return '    (void)SM_Init(&instance);';
    case 'reset':
      return '    (void)SM_Reset(&instance);';
    case 'step': {
      const delta = op.deltaMs !== undefined ? String(op.deltaMs) : 'SM_TICK_MS';
      return `    (void)SM_Step(&instance, ${delta});\n    (void)SM_Sync_IO(&instance);`;
    }
    case 'set-variable': {
      const varId = toCIdentifier(op.variableId);
      const valStr =
        typeof op.value === 'boolean'
          ? op.value ? 'true' : 'false'
          : typeof op.value === 'number'
            ? String(op.value)
            : String(op.value);
      const mapping = ir.ioMappings.find((m) => m.variableId === op.variableId && m.direction === 'read');
      if (mapping) {
        const ch = `MCAL_CH_${toCIdentifier(mapping.channelId).toUpperCase()}`;
        if (typeof op.value === 'boolean') {
          return `    instance.data.${varId} = ${valStr};\n    MCAL_SetChannelInputBool(${ch}, ${valStr});`;
        }
        return `    instance.data.${varId} = ${valStr};\n    MCAL_SetChannelInputDouble(${ch}, (double)(${valStr}));`;
      }
      return `    instance.data.${varId} = ${valStr};`;
    }
    case 'set-input': {
      const mapping = ir.ioMappings.find((m) => m.id === op.mappingId || m.variableId === op.mappingId || m.channelId === op.mappingId);
      const ch = mapping ? `MCAL_CH_${toCIdentifier(mapping.channelId).toUpperCase()}` : '0U';
      if (typeof op.rawValue === 'boolean') {
        return `    MCAL_SetChannelInputBool(${ch}, ${op.rawValue ? 'true' : 'false'});`;
      }
      return `    MCAL_SetChannelInputDouble(${ch}, ${Number(op.rawValue)});`;
    }
    case 'corrupt-field': {
      if (op.field === 'activeState') {
        return `    instance.active_states[0] = (SM_Node_t)${Number(op.invalidValue)};`;
      }
      if (op.field === 'executionSlot') {
        return `    instance.active_states[0] = (SM_Node_t)${Number(op.invalidValue)};`;
      }
      if (op.field === 'stateTimers') {
        return `    instance.state_timers[0] = (uint32_t)${Number(op.invalidValue)};`;
      }
      return `    /* Corrupted field ${op.field} */`;
    }
    case 'set-timer': {
      const idx = resolveStateIndex(ir, op.stateId);
      return `    instance.state_timers[${idx}] = (uint32_t)${op.valueMs};`;
    }
    case 'repeat-step': {
      const delta = op.deltaMs !== undefined ? String(op.deltaMs) : 'SM_TICK_MS';
      return `    {\n        size_t cycle;\n        for (cycle = 0; cycle < ${op.cycles}; cycle++) {\n            (void)SM_Step(&instance, ${delta});\n        }\n        (void)SM_Sync_IO(&instance);\n    }`;
    }
    default:
      return assertNever(op);
  }
};

const renderExpectation = (
  ir: SemanticModel,
  exp: SMTestExpectation,
): string => {
  switch (exp.kind) {
    case 'active-state': {
      const enumVal = resolveStateEnum(ir, exp.stateId);
      return `    ADIA_AssertBool(true, SM_IsStateActive(&instance, ${enumVal}), "${exp.stateId} should be active", __FILE__, (unsigned long)__LINE__);`;
    }
    case 'inactive-state': {
      const enumVal = resolveStateEnum(ir, exp.stateId);
      return `    ADIA_AssertBool(false, SM_IsStateActive(&instance, ${enumVal}), "${exp.stateId} should be inactive", __FILE__, (unsigned long)__LINE__);`;
    }
    case 'active-slot': {
      const enumVal = resolveStateEnum(ir, exp.stateId);
      return `    ADIA_AssertU32((uint32_t)${enumVal}, (uint32_t)instance.active_states[${exp.slot}], "slot ${exp.slot} active state", __FILE__, (unsigned long)__LINE__);`;
    }
    case 'variable': {
      const varId = toCIdentifier(exp.variableId);
      if (typeof exp.value === 'boolean') {
        return `    ADIA_AssertBool(${exp.value ? 'true' : 'false'}, instance.data.${varId}, "${exp.variableId} value", __FILE__, (unsigned long)__LINE__);`;
      }
      if (typeof exp.value === 'number') {
        if (Number.isInteger(exp.value)) {
          return `    ADIA_AssertU32((uint32_t)${exp.value}, (uint32_t)instance.data.${varId}, "${exp.variableId} value", __FILE__, (unsigned long)__LINE__);`;
        }
        return `    ADIA_AssertDouble(${exp.value}, (double)instance.data.${varId}, 0.001, "${exp.variableId} value", __FILE__, (unsigned long)__LINE__);`;
      }
      return `    /* variable expectation ${exp.variableId} */`;
    }
    case 'timer': {
      const idx = resolveStateIndex(ir, exp.stateId);
      const tol = exp.toleranceMs !== undefined ? exp.toleranceMs : 0;
      if (tol > 0) {
        return `    ADIA_AssertDouble((double)${exp.expectedMs}, (double)instance.state_timers[${idx}], ${tol}, "${exp.stateId} timer", __FILE__, (unsigned long)__LINE__);`;
      }
      return `    ADIA_AssertU32((uint32_t)${exp.expectedMs}, instance.state_timers[${idx}], "${exp.stateId} timer", __FILE__, (unsigned long)__LINE__);`;
    }
    case 'error': {
      const code = exp.code ? exp.code : 'SM_ERR_NONE';
      return `    ADIA_AssertU32((uint32_t)${code}, (uint32_t)SM_GetError(&instance), "error code ${code}", __FILE__, (unsigned long)__LINE__);`;
    }
    case 'fault-latched': {
      return `    ADIA_AssertBool(${exp.latched ? 'true' : 'false'}, instance.fault_latched, "fault latched flag", __FILE__, (unsigned long)__LINE__);`;
    }
    case 'transition-fired':
      return `    /* Expect transition ${exp.transitionId} fired */`;
    case 'action-executed':
      return `    /* Expect action ${exp.action} executed */`;
    case 'mcal-call':
      return `    /* Expect MCAL call to ${exp.functionName} */`;
    case 'mcal-call-count': {
      return `    ADIA_AssertU32((uint32_t)${exp.count}, (uint32_t)MCAL_TestCountByFunction("${exp.functionName}"), "MCAL call count ${exp.functionName}", __FILE__, (unsigned long)__LINE__);`;
    }
    case 'watchdog-kicks': {
      return `    ADIA_AssertU32((uint32_t)${exp.count}, (uint32_t)MCAL_TestCountByKind(MCAL_CALL_WATCHDOG_SERVICE), "watchdog service kicks", __FILE__, (unsigned long)__LINE__);`;
    }
    default:
      return assertNever(exp);
  }
};

const renderTestCaseFunction = (
  ir: SemanticModel,
  testCase: SMTestCase,
): string => {
  const fnName = `test_${toCIdentifier(testCase.id).toLowerCase()}`;
  const trace = testCase.traceability;

  if (testCase.id === 'SM-TC-INIT-NULL-INSTANCE') {
    return `/*
 * Case ID: ${testCase.id}
 * Name: ${testCase.name}
 */
static void ${fnName}(void)
{
    ADIA_Instance_t instance;
    SM_Error_t err;
    (void)instance;
    MCAL_TestReset();
    err = SM_Init(NULL);
    ADIA_AssertU32((uint32_t)SM_ERR_NULL_INSTANCE, (uint32_t)err, "error code SM_ERR_NULL_INSTANCE", __FILE__, (unsigned long)__LINE__);
}
`;
  }

  if (testCase.id === 'SM-TC-RESET-NULL-INSTANCE') {
    return `/*
 * Case ID: ${testCase.id}
 * Name: ${testCase.name}
 */
static void ${fnName}(void)
{
    ADIA_Instance_t instance;
    SM_Error_t err;
    (void)instance;
    MCAL_TestReset();
    err = SM_Reset(NULL);
    ADIA_AssertU32((uint32_t)SM_ERR_NULL_INSTANCE, (uint32_t)err, "error code SM_ERR_NULL_INSTANCE", __FILE__, (unsigned long)__LINE__);
}
`;
  }

  if (testCase.id === 'SM-TC-ROB-NULL-STEP') {
    return `/*
 * Case ID: ${testCase.id}
 * Name: ${testCase.name}
 */
static void ${fnName}(void)
{
    ADIA_Instance_t instance;
    SM_Error_t err;
    (void)instance;
    MCAL_TestReset();
    err = SM_Step(NULL, SM_TICK_MS);
    ADIA_AssertU32((uint32_t)SM_ERR_NULL_INSTANCE, (uint32_t)err, "error code SM_ERR_NULL_INSTANCE", __FILE__, (unsigned long)__LINE__);
}
`;
  }

  const opsCode = testCase.operations
    .map((op) => renderOperation(ir, op))
    .join('\n');

  const expCode = testCase.expectations
    .map((exp) => renderExpectation(ir, exp))
    .join('\n');

  return `/*
 * Case ID: ${testCase.id}
 * Name: ${testCase.name}
 * Model: ${trace.modelId}
 * States: ${trace.stateIds.join(', ')}
 * Transitions: ${trace.transitionIds.join(', ')}
 * Requirements: ${trace.requirementIds.join(', ')}
 * Generated Functions: ${trace.generatedFunctions.join(', ')}
 */
static void ${fnName}(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();
${opsCode ? '\n' + opsCode : ''}
${expCode ? '\n' + expCode : ''}
}
`;
};

export const renderCTestSuite = (
  suite: SMTestSuite,
  ir: SemanticModel,
  manifest: SMTestManifest,
): string => {
  const suiteCases = manifest.cases.filter((c) => c.suite === suite);
  const applicableCases = suiteCases.filter((c) => c.applicability.status === 'applicable');

  const testFunctions = applicableCases
    .map((tc) => renderTestCaseFunction(ir, tc))
    .join('\n');

  const caseEntries = applicableCases
    .map((tc) => {
      const fnName = `test_${toCIdentifier(tc.id).toLowerCase()}`;
      return `    { "${tc.id}", "${tc.name}", ${fnName} },`;
    })
    .join('\n');

  return `/*
 * ADIA Generated Test Suite: ${suite}
 * Automatically derived from state machine semantic model.
 */
#include "test_support.h"
#include "mcal_test_stub.h"
#include "sm_core.h"
#include "sm_config.h"
#include "sm_mapping.h"
#include "sm_safety.h"
#include "mcal_dio.h"

${testFunctions}
${applicableCases.length > 0 ? `static const ADIA_TestCase s_${suite}_cases[] = {
${caseEntries}
};

int run_suite_${suite}(void)
{
    return ADIA_TestRun(s_${suite}_cases, sizeof(s_${suite}_cases) / sizeof(s_${suite}_cases[0]));
}` : `int run_suite_${suite}(void)
{
    return 0;
}`}
`;
};

export const renderSMCTestPackage = (
  ir: SemanticModel,
  manifest: SMTestManifest,
  options: CTestSuiteRenderOptions = {},
): readonly GeneratedCFile[] => {
  const standard = options.standard ?? ir.verification.cStandard;
  const files: GeneratedCFile[] = [];

  // 1. Render test runtime support and MCAL stubs
  const runtimeFiles = renderCTestRuntimeFiles({
    standard,
    mappings: ir.ioMappings,
  });
  files.push(...runtimeFiles);

  // 2. Render all 9 suite files (including hierarchy)
  const suites: readonly SMTestSuite[] = [
    'initialization',
    'transitions',
    'actions',
    'timing',
    'safety',
    'io',
    'reset',
    'robustness',
    'hierarchy',
  ];

  for (const suite of suites) {
    files.push({
      name: `tests/test_sm_${suite}.c`,
      content: renderCTestSuite(suite, ir, manifest),
    });
  }

  // 3. Manifest json
  files.push({
    name: 'verification/test_manifest.json',
    content: serializeSMTestManifest(manifest),
  });

  return Object.freeze(files);
};
