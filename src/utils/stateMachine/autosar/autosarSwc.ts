import { coreCType, platformInitLiteral, type AutosarPortModel } from './autosarPorts';
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
    ' * clears its counter. Override at build time with -D.',
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
    port.platformType === 'boolean'
      ? `            ${inst}.data.${port.cName} = (value != FALSE);`
      : `            ${inst}.data.${port.cName} = (${coreCType(port.platformType)})value;`,
    '        }',
    `        ${swc}_TrackRead(${index}U, accepted);`,
    '    }',
  ]);
  const writeProvided = ports.provided.map((port) => port.platformType === 'boolean'
    ? `    (void)Rte_Write_PP_${port.cName}_${port.dataElementName}(instance->data.${port.cName} ? TRUE : FALSE);`
    : `    (void)Rte_Write_PP_${port.cName}_${port.dataElementName}((${port.platformType})instance->data.${port.cName});`);

  const helpers = [
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
    `static FUNC(void, ${swc}_CODE) ${swc}_WriteProvidedPorts(const ADIA_Instance_t *instance)`,
    '{',
    ...(writeProvided.length > 0 ? writeProvided : ['    (void)instance;', '    /* The model assigns no variable: no data port is provided. */']),
    '}',
    '',
    ...(ctx.safetyMode
      ? [
        '/*',
        ' * Platform hook of the state-machine core (see sm_safety.h), called when the',
        ' * safe state is entered. In AUTOSAR the safe outputs are not driven through',
        ' * MCAL: the safe values are published on the provided ports immediately.',
        ' * Integrators may add further reactions (e.g. a mode-switch request) here.',
        ' */',
        'void SM_Platform_ApplySafeOutputs(ADIA_Instance_t *instance)',
        '{',
        `    ${swc}_WriteProvidedPorts(instance);`,
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
    `    ${swc}_WriteProvidedPorts(&${inst});`,
    `    ${swc}_WriteStatusPorts();`,
    '}',
    '',
    `FUNC(void, ${swc}_CODE) ${swc}_MainFunction(void)`,
    '{',
    '    uint8 demStatus = DEM_EVENT_STATUS_PASSED;',
    '    SM_Error_t stepResult;',
    ...readBlocks,
    `    stepResult = SM_Step(&${inst}, ${swcUpper}_PERIOD_MS);`,
    `    ${swc}_WriteProvidedPorts(&${inst});`,
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
