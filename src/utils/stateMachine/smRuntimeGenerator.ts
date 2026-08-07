import type { SemanticModel } from './smSemanticModel';

export interface GeneratedFile {
  name: string;
  content: string;
  overwritePolicy?: 'ALWAYS' | 'CREATE_IF_MISSING';
}

export function renderRuntimeFiles(ir: SemanticModel): GeneratedFile[] {
  const configHeader = `#ifndef SM_CONFIG_H\n#define SM_CONFIG_H\n\n#include <stdint.h>\n#include <stdbool.h>\n\n#define SM_ENABLE_TRACE 1\n#define SM_ENABLE_ASSERTS 1\n#define SM_ENABLE_RUNTIME_CHECKS 1\n#define SM_ENABLE_COVERAGE 0\n#define SM_MAX_ACTIVE_STATES 16\n#define SM_TIMEBASE_UNIT_MS 1\n#define SM_XB_ABS_EPSILON (1.0e-7F)\n#define SM_XB_REL_EPSILON (1.0e-6F)\n\n#if defined(__STDC_VERSION__) && (__STDC_VERSION__ >= 201112L)\n#define SM_STATIC_ASSERT(cond, msg) _Static_assert((cond), msg)\n#else\n#define SM_STATIC_ASSERT_GLUE_(a, b) a##b\n#define SM_STATIC_ASSERT_GLUE(a, b) SM_STATIC_ASSERT_GLUE_(a, b)\n#define SM_STATIC_ASSERT(cond, msg) typedef char SM_STATIC_ASSERT_GLUE(sm_static_assert_, __LINE__)[(cond) ? 1 : -1]\n#endif\n\nSM_STATIC_ASSERT(sizeof(float) == 4U, "Unsupported float storage width");\nSM_STATIC_ASSERT(sizeof(double) == 8U, "Unsupported double storage width");\n\n#endif /* SM_CONFIG_H */\n`;

  const versionHeader = `#ifndef SM_VERSION_H\n#define SM_VERSION_H\n\n#define SM_GENERATOR_VERSION "3.1"\n#define SM_MODEL_HASH "${ir.modelHash || '0000000000000000'}"\n#define SM_CODE_VERSION 0x030100\n\n#endif /* SM_VERSION_H */\n`;

  const runtimeHeader = `#ifndef SM_RUNTIME_H\n#define SM_RUNTIME_H\n\n#include <stdint.h>\n#include <stdbool.h>\n\ntypedef enum\n{\n    SM_ERR_NONE = 0,\n    SM_ERR_NULL_POINTER,\n    SM_ERR_INVALID_STATE,\n    SM_ERR_INVALID_CONFIGURATION,\n    SM_ERR_TIMING_VIOLATION,\n    SM_ERR_BOUNDS,\n    SM_ERR_NUMERIC_FAULT,\n    SM_ERR_INTERNAL\n} SM_Error_t;\n\n#endif /* SM_RUNTIME_H */\n`;

  const runtimeSource = `#include "sm_runtime.h"\n#include "sm_config.h"\n\n/* Reusable State Machine Runtime Infrastructure */\n`;

  const manifest = JSON.stringify({
    generator: "ADIA",
    version: "3.1",
    modelHash: ir.modelHash || "0000000000000000",
    generatedFiles: ["generated/sm_core.c", "generated/sm_core.h", "generated/sm_types.h", "generated/sm_config.h", "generated/sm_version.h"],
    runtimeFiles: ["runtime/sm_runtime.c", "runtime/sm_runtime.h"]
  }, null, 2);

  return [
    { name: 'generated/sm_config.h', content: configHeader, overwritePolicy: 'ALWAYS' },
    { name: 'generated/sm_version.h', content: versionHeader, overwritePolicy: 'ALWAYS' },
    { name: 'runtime/sm_runtime.h', content: runtimeHeader, overwritePolicy: 'ALWAYS' },
    { name: 'runtime/sm_runtime.c', content: runtimeSource, overwritePolicy: 'ALWAYS' },
    { name: 'generated/manifest.json', content: manifest, overwritePolicy: 'ALWAYS' },
  ];
}
