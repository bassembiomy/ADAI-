import { coreCType, platformInitLiteral, portLiteral, type AutosarPort, type AutosarPortModel } from './autosarPorts';
import { traceComment } from './autosarTrace';

export interface SwcRenderContext {
  swc: string;
  swcUpper: string;
  tickMs: number;
  ports: AutosarPortModel;
  /** 16 hex digits, identical in every deliverable. */
  fingerprint: string;
  safetyMode: boolean;
  /** The model divides: the core guards `/` and `%` and a zero divisor is a model fault. */
  hasDivision?: boolean;
}

/** Memory sections used by the component and the core (in this order). */
export const SWC_MEMORY_SECTIONS: readonly string[] = ['CODE', 'VAR_CLEARED_UNSPECIFIED'];

export const isFloatPlatformType = (platformType: string): boolean =>
  platformType === 'float32' || platformType === 'float64';

const lines = (...parts: Array<string | null | undefined>): string =>
  `${parts.filter((part): part is string => typeof part === 'string').join('\n')}\n`;

const instanceRef = (ctx: SwcRenderContext): string => `${ctx.swc}_Instance`;

export const renderSwcHeader = (ctx: SwcRenderContext): string => {
  const { swc, swcUpper } = ctx;
  return lines(
    ...traceComment(ctx.fingerprint),
    `#ifndef ${swcUpper}_H`,
    `#define ${swcUpper}_H`,
    '',
    '#include "Std_Types.h"',
    '#include "Compiler.h"',
    `#include "Compiler_Cfg.h"`,
    '',
    `#define ${swcUpper}_VENDOR_ID 9999U`,
    `#define ${swcUpper}_MODULE_ID 255U`,
    `#define ${swcUpper}_AR_RELEASE_MAJOR_VERSION 4U`,
    `#define ${swcUpper}_AR_RELEASE_MINOR_VERSION 4U`,
    `#define ${swcUpper}_AR_RELEASE_REVISION_VERSION 0U`,
    `#define ${swcUpper}_SW_MAJOR_VERSION 1U`,
    `#define ${swcUpper}_SW_MINOR_VERSION 0U`,
    `#define ${swcUpper}_SW_PATCH_VERSION 0U`,
    '',
    '/* Period of the TimingEvent that triggers the main runnable (ms). */',
    `#define ${swcUpper}_PERIOD_MS ${ctx.tickMs}U`,
    '',
    '/*',
    ' * Consecutive failed reads of one required port (error status, or a non-finite',
    ' * float) after which MainFunction reports Dem FAILED. A good read of that port',
    ' * clears its counter. A required port whose invalid-input policy is',
    ' * "diagnostic-fault" also latches the core fault when it reaches the limit.',
    ' * Override at build time with -D.',
    ' */',
    `#ifndef ${swcUpper}_RTE_ERROR_LIMIT`,
    `#define ${swcUpper}_RTE_ERROR_LIMIT 10U`,
    '#endif',
    '',
    '/* InitEvent runnable. */',
    `FUNC(void, ${swc}_CODE) ${swc}_Init(void);`,
    '/* TimingEvent runnable, one state-machine step per activation. */',
    `FUNC(void, ${swc}_CODE) ${swc}_MainFunction(void);`,
    '',
    '#ifdef ADIA_TESTING',
    '#include "sm_config.h"',
    '/* Test hook: the component instance. Not part of a production build. */',
    `FUNC_P2VAR(ADIA_Instance_t, AUTOMATIC, ${swc}_CODE) ${swc}_Test_GetInstance(void);`,
    '#endif',
    '',
    `#endif /* ${swcUpper}_H */`,
  );
};

const section = (swc: string, name: string, body: string[]): string[] => [
  `#define ${swc}_START_SEC_${name}`,
  `#include "${swc}_MemMap.h"`,
  ...body,
  `#define ${swc}_STOP_SEC_${name}`,
  `#include "${swc}_MemMap.h"`,
];

export const renderSwcSource = (ctx: SwcRenderContext): string => {
  const { swc, swcUpper, ports } = ctx;
  const inst = instanceRef(ctx);
  const count = ports.required.length;
  const hasFloat = ports.required.some((port) => isFloatPlatformType(port.platformType));
  const errors = `${swc}_RteErrors`;

  const policyOf = (port: AutosarPort): string => port.invalidInputPolicy ?? 'reject';
  const assignCore = (port: AutosarPort, source: string): string => port.platformType === 'boolean'
    ? `${inst}.data.${port.cName} = (${source} != FALSE);`
    : `${inst}.data.${port.cName} = (${coreCType(port.platformType)})${source};`;
  const clampLines = (port: AutosarPort): string[] => [
    ...(port.clampMax === undefined ? [] : [
      `            if (value > ${portLiteral(port.platformType, port.clampMax)}) {`,
      `                value = ${portLiteral(port.platformType, port.clampMax)};`,
      '            }',
    ]),
    ...(port.clampMin === undefined ? [] : [
      `            if (value < ${portLiteral(port.platformType, port.clampMin)}) {`,
      `                value = ${portLiteral(port.platformType, port.clampMin)};`,
      '            }',
    ]),
  ];
  const readBlocks = ports.required.flatMap((port, index) => [
    '    {',
    `        ${port.platformType} value = ${platformInitLiteral(port)};`,
    `        boolean accepted = ${swc}_ReadAccepted(Rte_Read_RP_${port.cName}_${port.dataElementName}(&value));`,
    ...(isFloatPlatformType(port.platformType)
      ? [
        '        if (accepted != FALSE) {',
        `            accepted = ${swc}_IsFinite(value);`,
        '        }',
      ]
      : []),
    '        if (accepted != FALSE) {',
    ...(policyOf(port) === 'clamp' ? clampLines(port) : []),
    `            ${assignCore(port, 'value')}`,
    ...(policyOf(port) === 'default'
      ? [
        '        } else {',
        '            /* invalid-input policy "default": fail-safe substitution with the model initial value */',
        `            ${port.platformType === 'boolean'
          ? `${inst}.data.${port.cName} = ${port.initValue === '1' ? 'true' : 'false'};`
          : assignCore(port, platformInitLiteral(port))}`,
      ]
      : []),
    '        }',
    `        ${swc}_TrackRead(${index}U, accepted);`,
    '    }',
  ]);
  const diagnosticIndexes = ports.required
    .map((port, index) => (policyOf(port) === 'diagnostic-fault' ? index : -1))
    .filter((index) => index >= 0);
  const safePorts = ports.provided.filter((port) => port.safeValue !== undefined);
  const hasSafeValues = safePorts.length > 0;
  const writeProvided = ports.provided.flatMap((port) => {
    const normal = port.platformType === 'boolean'
      ? `(void)Rte_Write_PP_${port.cName}_${port.dataElementName}(instance->data.${port.cName} ? TRUE : FALSE);`
      : `(void)Rte_Write_PP_${port.cName}_${port.dataElementName}((${port.platformType})instance->data.${port.cName});`;
    if (port.safeValue === undefined) return [`    ${normal}`];
    return [
      '    if (faulted != FALSE) {',
      `        (void)Rte_Write_PP_${port.cName}_${port.dataElementName}(${portLiteral(port.platformType, port.safeValue)}); /* safe value */`,
      '    } else {',
      `        ${normal}`,
      '    }',
    ];
  });

  const helpers = [
    ...(hasSafeValues
      ? [
        '/* The core fault is latched (or an error is pending): provided ports with a safe value publish it. */',
        `static FUNC(boolean, ${swc}_CODE) ${swc}_IsFaulted(const ADIA_Instance_t *instance)`,
        '{',
        '    boolean faulted = FALSE;',
        '    if ((instance->fault_latched) || (instance->error_status != SM_ERR_NONE)) {',
        '        faulted = TRUE;',
        '    }',
        '    return faulted;',
        '}',
        '',
      ]
      : []),
    ...(hasFloat
      ? [
        `static FUNC(boolean, ${swc}_CODE) ${swc}_IsFinite(float64 value)`,
        '{',
        '    boolean finite = FALSE;',
        '    if (isfinite(value) != 0) {',
        '        finite = TRUE;',
        '    }',
        '    return finite;',
        '}',
        '',
      ]
      : []),
    ...(count > 0
      ? [
        '/* A read is valid when the data arrived; RTE_E_LOST_DATA is an overlaid "data valid, older values lost" flag. */',
        `static FUNC(boolean, ${swc}_CODE) ${swc}_ReadAccepted(Std_ReturnType status)`,
        '{',
        '    boolean accepted = FALSE;',
        '    if ((status == RTE_E_OK) || (status == RTE_E_LOST_DATA)) {',
        '        accepted = TRUE;',
        '    }',
        '    return accepted;',
        '}',
        '',
        '/* Per-port consecutive failure counter: cleared by a good read, saturating at the limit. */',
        `static FUNC(void, ${swc}_CODE) ${swc}_TrackRead(uint32 index, boolean accepted)`,
        '{',
        '    if (accepted != FALSE) {',
        `        ${errors}[index] = 0U;`,
        `    } else if (${errors}[index] < ${swcUpper}_RTE_ERROR_LIMIT) {`,
        `        ${errors}[index] = ${errors}[index] + 1U;`,
        '    } else {',
        '        /* saturated: the counter never wraps */',
        '    }',
        '}',
        '',
        ...(diagnosticIndexes.length > 0
          ? [
            '/* Invalid-input policy "diagnostic-fault": persistent loss of such a port is a core fault. */',
            `static FUNC(boolean, ${swc}_CODE) ${swc}_DiagnosticFaultReached(void)`,
            '{',
            '    boolean reached = FALSE;',
            `    if (${diagnosticIndexes.map((index) => `${diagnosticIndexes.length > 1 ? '(' : ''}${errors}[${index}U] >= ${swcUpper}_RTE_ERROR_LIMIT${diagnosticIndexes.length > 1 ? ')' : ''}`).join(' || ')}) {`,
            '        reached = TRUE;',
            '    }',
            '    return reached;',
            '}',
            '',
          ]
          : []),
        `static FUNC(boolean, ${swc}_CODE) ${swc}_RteLimitReached(void)`,
        '{',
        '    boolean reached = FALSE;',
        '    uint32 index;',
        `    for (index = 0U; index < ${count}U; index++) {`,
        `        if (${errors}[index] >= ${swcUpper}_RTE_ERROR_LIMIT) {`,
        '            reached = TRUE;',
        '        }',
        '    }',
        '    return reached;',
        '}',
        '',
      ]
      : []),
  ];

  const code = [
    ...helpers,
    hasSafeValues
      ? `static FUNC(void, ${swc}_CODE) ${swc}_WriteProvidedPorts(const ADIA_Instance_t *instance, boolean forceSafe)`
      : `static FUNC(void, ${swc}_CODE) ${swc}_WriteProvidedPorts(const ADIA_Instance_t *instance)`,
    '{',
    ...(hasSafeValues
      ? [
        '    boolean faulted = forceSafe;',
        '    if (faulted == FALSE) {',
        `        faulted = ${swc}_IsFaulted(instance);`,
        '    }',
      ]
      : []),
    ...(writeProvided.length > 0 ? writeProvided : ['    (void)instance;', '    /* The model assigns no variable: no data port is provided. */']),
    '}',
    '',
    ...(ctx.safetyMode
      ? [
        '/*',
        ' * Platform hook of the state-machine core (see sm_safety.h), called when the',
        ' * safe state is entered. In AUTOSAR the safe outputs are not driven through',
        ' * MCAL: the safe state is published on the provided ports immediately',
        ' * (provided ports with a safe value publish that value).',
        ' * Integrators may add further reactions (e.g. a mode-switch request) here.',
        ' */',
        'void SM_Platform_ApplySafeOutputs(ADIA_Instance_t *instance)',
        '{',
        `    ${swc}_WriteProvidedPorts(instance${hasSafeValues ? ', TRUE' : ''});`,
        '}',
        '',
      ]
      : []),
    `static FUNC(void, ${swc}_CODE) ${swc}_WriteStatusPorts(void)`,
    '{',
    `    (void)Rte_Write_PP_SmStatus_ActiveState((uint16)SM_GetActiveSlot(&${inst}, 0U));`,
    `    (void)Rte_Write_PP_SmStatus_ErrorStatus((uint8)SM_GetError(&${inst}));`,
    '}',
    '',
    `FUNC(void, ${swc}_CODE) ${swc}_Init(void)`,
    '{',
    ...ports.required.map((_port, index) => `    ${errors}[${index}] = 0U;`),
    '    /* A failing initialisation is latched in the instance and published below. */',
    `    (void)SM_Init(&${inst});`,
    `    ${swc}_WriteProvidedPorts(&${inst}${hasSafeValues ? ', FALSE' : ''});`,
    `    ${swc}_WriteStatusPorts();`,
    '}',
    '',
    `FUNC(void, ${swc}_CODE) ${swc}_MainFunction(void)`,
    '{',
    '    uint8 demStatus = DEM_EVENT_STATUS_PASSED;',
    '    SM_Error_t stepResult;',
    ...readBlocks,
    ...(diagnosticIndexes.length > 0
      ? [
        `    if (${swc}_DiagnosticFaultReached() != FALSE) {`,
        `        (void)SM_Report_External_Fault(&${inst});`,
        '    }',
      ]
      : []),
    `    stepResult = SM_Step(&${inst}, ${swcUpper}_PERIOD_MS);`,
    `    ${swc}_WriteProvidedPorts(&${inst}${hasSafeValues ? ', FALSE' : ''});`,
    `    ${swc}_WriteStatusPorts();`,
    '    if (stepResult != SM_ERR_NONE) {',
    '        demStatus = DEM_EVENT_STATUS_FAILED;',
    '    }',
    ...(count > 0
      ? [
        `    if (${swc}_RteLimitReached() != FALSE) {`,
        '        demStatus = DEM_EVENT_STATUS_FAILED;',
        '    }',
      ]
      : []),
    '    (void)Rte_Call_RP_SmFaultEvent_SetEventStatus(demStatus);',
    '}',
    '',
    '#ifdef ADIA_TESTING',
    `FUNC_P2VAR(ADIA_Instance_t, AUTOMATIC, ${swc}_CODE) ${swc}_Test_GetInstance(void)`,
    '{',
    `    return &${inst};`,
    '}',
    '#endif',
  ];
  return lines(
    ...traceComment(ctx.fingerprint),
    `#include "${swc}.h"`,
    `#include "Rte_${swc}.h"`,
    ...(hasFloat ? ['#include <math.h>'] : []),
    '#include "sm_core.h"',
    ...(ctx.safetyMode ? ['#include "sm_safety.h"'] : []),
    '',
    ...section(swc, 'VAR_CLEARED_UNSPECIFIED', [
      `static ADIA_Instance_t ${inst};`,
      ...(count > 0 ? [`static uint32 ${errors}[${count}U];`] : []),
    ]),
    '',
    ...section(swc, 'CODE', code),
  );
};
