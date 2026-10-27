import { coreCType, platformInitLiteral, type AutosarPortModel } from './autosarPorts';

export interface SwcRenderContext {
  swc: string;
  swcUpper: string;
  tickMs: number;
  ports: AutosarPortModel;
}

const lines = (...parts: Array<string | null | undefined>): string =>
  `${parts.filter((part): part is string => typeof part === 'string').join('\n')}\n`;

const instanceRef = (ctx: SwcRenderContext): string => `${ctx.swc}_Instance`;

export const renderSwcHeader = (ctx: SwcRenderContext): string => {
  const { swc, swcUpper } = ctx;
  return lines(
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
    '/* InitEvent runnable. */',
    `FUNC(void, ${swc}_CODE) ${swc}_Init(void);`,
    '/* TimingEvent runnable, one state-machine step per activation. */',
    `FUNC(void, ${swc}_CODE) ${swc}_MainFunction(void);`,
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
  const readBlocks = ports.required.flatMap((port) => [
    '    {',
    `        ${port.platformType} value = ${platformInitLiteral(port)};`,
    `        const Std_ReturnType status = Rte_Read_RP_${port.cName}_${port.dataElementName}(&value);`,
    '        if ((status == RTE_E_OK) || (status == RTE_E_LOST_DATA)) {',
    port.platformType === 'boolean'
      ? `            ${inst}.data.${port.cName} = (value != FALSE);`
      : `            ${inst}.data.${port.cName} = (${coreCType(port.platformType)})value;`,
    '        }',
    '    }',
  ]);
  const writeProvided = ports.provided.map((port) => port.platformType === 'boolean'
    ? `    (void)Rte_Write_PP_${port.cName}_${port.dataElementName}(${inst}.data.${port.cName} ? TRUE : FALSE);`
    : `    (void)Rte_Write_PP_${port.cName}_${port.dataElementName}((${port.platformType})${inst}.data.${port.cName});`);
  const code = [
    '/*',
    ' * Platform hook of the state-machine core (see sm_safety.h). In AUTOSAR the',
    ' * safe outputs are not driven through MCAL: entering the safe state updates',
    ' * the instance data and the runnables write every provided port from that',
    ' * data after each step, so the safe values reach the RTE ports. Integrators',
    ' * may add further reactions (e.g. a mode-switch request) here.',
    ' */',
    'void SM_Platform_ApplySafeOutputs(ADIA_Instance_t *instance)',
    '{',
    '    (void)instance;',
    '}',
    '',
    `static FUNC(void, ${swc}_CODE) ${swc}_WriteStatusPorts(void)`,
    '{',
    `    (void)Rte_Write_PP_SmStatus_ActiveState((uint16)SM_GetActiveSlot(&${inst}, 0U));`,
    `    (void)Rte_Write_PP_SmStatus_ErrorStatus((uint8)SM_GetError(&${inst}));`,
    '}',
    '',
    `static FUNC(void, ${swc}_CODE) ${swc}_WriteProvidedPorts(void)`,
    '{',
    ...(writeProvided.length > 0 ? writeProvided : ['    /* The model assigns no variable: no data port is provided. */']),
    '}',
    '',
    `FUNC(void, ${swc}_CODE) ${swc}_Init(void)`,
    '{',
    '    /* A failing initialisation is latched in the instance and published below. */',
    `    (void)SM_Init(&${inst});`,
    `    ${swc}_WriteProvidedPorts();`,
    `    ${swc}_WriteStatusPorts();`,
    '}',
    '',
    `FUNC(void, ${swc}_CODE) ${swc}_MainFunction(void)`,
    '{',
    '    uint8 demStatus;',
    '    SM_Error_t stepResult;',
    ...readBlocks,
    `    stepResult = SM_Step(&${inst}, ${swcUpper}_PERIOD_MS);`,
    `    ${swc}_WriteProvidedPorts();`,
    `    ${swc}_WriteStatusPorts();`,
    '    if (stepResult == SM_ERR_NONE) {',
    '        demStatus = DEM_EVENT_STATUS_PASSED;',
    '    } else {',
    '        demStatus = DEM_EVENT_STATUS_FAILED;',
    '    }',
    '    (void)Rte_Call_RP_SmFaultEvent_SetEventStatus(demStatus);',
    '}',
  ];
  return lines(
    `#include "${swc}.h"`,
    `#include "Rte_${swc}.h"`,
    '#include "sm_core.h"',
    '#include "sm_safety.h"',
    '',
    ...section(swc, 'VAR_CLEARED_UNSPECIFIED', [`static ADIA_Instance_t ${inst};`]),
    '',
    ...section(swc, 'CODE', code),
  );
};
