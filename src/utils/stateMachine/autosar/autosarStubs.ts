import { coreCType, INTEGER_RANGES, platformInitLiteral, portLiteral, type AutosarPort } from './autosarPorts';
import { isFloatPlatformType, SWC_MEMORY_SECTIONS, type SwcRenderContext } from './autosarSwc';
import { traceComment } from './autosarTrace';

const lines = (...parts: Array<string | null | undefined>): string =>
  `${parts.filter((part): part is string => typeof part === 'string').join('\n')}\n`;

const banner = (file: string): string[] => [
  '/*',
  ` * ${file} - HOST-ONLY STAND-IN (contract phase).`,
  ' * Generated so that the software component compiles and its unit test runs',
  " * without an AUTOSAR stack. Replace this file with your AUTOSAR stack's own",
  ' * file when integrating; do not ship it to the target.',
  ' */',
];

export const renderStdTypes = (): string => lines(
  ...banner('Std_Types.h'),
  '#ifndef STD_TYPES_H',
  '#define STD_TYPES_H',
  '',
  '#include "Platform_Types.h"',
  '#include "Compiler.h"',
  '',
  'typedef uint8 Std_ReturnType;',
  '',
  'typedef struct {',
  '    uint16 vendorID;',
  '    uint16 moduleID;',
  '    uint8 sw_major_version;',
  '    uint8 sw_minor_version;',
  '    uint8 sw_patch_version;',
  '} Std_VersionInfoType;',
  '',
  '#define E_OK ((Std_ReturnType)0U)',
  '#define E_NOT_OK ((Std_ReturnType)1U)',
  '',
  '#define STD_HIGH 1U',
  '#define STD_LOW 0U',
  '#define STD_ACTIVE 1U',
  '#define STD_IDLE 0U',
  '#define STD_ON 1U',
  '#define STD_OFF 0U',
  '',
  '#define NULL_PTR ((void *)0)',
  '',
  '#endif /* STD_TYPES_H */',
);

export const renderPlatformTypes = (): string => lines(
  ...banner('Platform_Types.h'),
  '#ifndef PLATFORM_TYPES_H',
  '#define PLATFORM_TYPES_H',
  '',
  '#define CPU_TYPE_8 8',
  '#define CPU_TYPE_16 16',
  '#define CPU_TYPE_32 32',
  '#define CPU_TYPE_64 64',
  '#define MSB_FIRST 0',
  '#define LSB_FIRST 1',
  '#define HIGH_BYTE_FIRST 0',
  '#define LOW_BYTE_FIRST 1',
  '',
  '#define CPU_TYPE CPU_TYPE_32',
  '#define CPU_BIT_ORDER LSB_FIRST',
  '#define CPU_BYTE_ORDER LOW_BYTE_FIRST',
  '',
  '#ifndef TRUE',
  '#define TRUE 1U',
  '#endif',
  '#ifndef FALSE',
  '#define FALSE 0U',
  '#endif',
  '',
  'typedef unsigned char boolean;',
  'typedef signed char sint8;',
  'typedef unsigned char uint8;',
  'typedef signed short sint16;',
  'typedef unsigned short uint16;',
  'typedef signed int sint32;',
  'typedef unsigned int uint32;',
  'typedef signed long long sint64;',
  'typedef unsigned long long uint64;',
  'typedef float float32;',
  'typedef double float64;',
  '',
  '#endif /* PLATFORM_TYPES_H */',
);

export const renderCompiler = (): string => lines(
  ...banner('Compiler.h'),
  '#ifndef COMPILER_H',
  '#define COMPILER_H',
  '',
  '#include "Compiler_Cfg.h"',
  '',
  '#define AUTOMATIC',
  '#define TYPEDEF',
  '#define STATIC static',
  '#define INLINE inline',
  '#define LOCAL_INLINE static inline',
  '#define NULL_PTR_CHECKED',
  '',
  '#define FUNC(rettype, memclass) rettype',
  '#define FUNC_P2CONST(rettype, ptrclass, memclass) const rettype *',
  '#define FUNC_P2VAR(rettype, ptrclass, memclass) rettype *',
  '#define P2VAR(ptrtype, memclass, ptrclass) ptrtype *',
  '#define P2CONST(ptrtype, memclass, ptrclass) const ptrtype *',
  '#define CONSTP2VAR(ptrtype, memclass, ptrclass) ptrtype * const',
  '#define CONSTP2CONST(ptrtype, memclass, ptrclass) const ptrtype * const',
  '#define P2FUNC(rettype, ptrclass, fctname) rettype (*fctname)',
  '#define CONST(type, memclass) const type',
  '#define VAR(type, memclass) type',
  '',
  '#endif /* COMPILER_H */',
);

export const renderCompilerCfg = (ctx: SwcRenderContext): string => lines(
  ...banner('Compiler_Cfg.h'),
  '#ifndef COMPILER_CFG_H',
  '#define COMPILER_CFG_H',
  '',
  `#define ${ctx.swc}_CODE`,
  `#define ${ctx.swc}_CONST`,
  `#define ${ctx.swc}_VAR`,
  `#define ${ctx.swc}_APPL_CODE`,
  `#define ${ctx.swc}_APPL_CONST`,
  `#define ${ctx.swc}_APPL_DATA`,
  '#define RTE_CODE',
  '#define RTE_APPL_DATA',
  '#define RTE_APPL_CODE',
  '',
  '#endif /* COMPILER_CFG_H */',
);

export const renderMemMap = (ctx: SwcRenderContext): string => {
  const { swc } = ctx;
  const sections = SWC_MEMORY_SECTIONS;
  const branches = sections.flatMap((name) => [
    ['START', name],
    ['STOP', name],
  ]).map(([edge, name], index) => [
    `${index === 0 ? '#if' : '#elif'} defined(${swc}_${edge}_SEC_${name})`,
    `#undef ${swc}_${edge}_SEC_${name}`,
    `/* ${edge === 'START' ? 'Begin' : 'End'} of section ${name}: add the compiler pragma of your target here. */`,
  ]).flat();
  return lines(
    ...banner(`${swc}_MemMap.h`),
    '/* No include guard: this file is included once per section boundary. */',
    ...branches,
    '#else',
    `#error "${swc}_MemMap.h: unknown or missing memory section define"`,
    '#endif',
  );
};

export const renderRteHeader = (ctx: SwcRenderContext): string => {
  const { swc, ports } = ctx;
  const reads = ports.required.map((port) =>
    `FUNC(Std_ReturnType, RTE_CODE) Rte_Read_RP_${port.cName}_${port.dataElementName}(P2VAR(${port.platformType}, AUTOMATIC, RTE_APPL_DATA) data);`);
  const writes = ports.provided.map((port) =>
    `FUNC(Std_ReturnType, RTE_CODE) Rte_Write_PP_${port.cName}_${port.dataElementName}(${port.platformType} data);`);
  return lines(
    ...banner(`Rte_${swc}.h`),
    `#ifndef RTE_${ctx.swcUpper}_H`,
    `#define RTE_${ctx.swcUpper}_H`,
    '',
    '#include "Std_Types.h"',
    `#include "${swc}.h"`,
    '',
    '/* Standard RTE return codes (AUTOSAR RTE specification). */',
    '#define RTE_E_OK ((Std_ReturnType)0U)',
    '#define RTE_E_INVALID ((Std_ReturnType)1U)',
    '/* Overlaid flag: the data was read, but at least one value was lost. */',
    '#define RTE_E_LOST_DATA ((Std_ReturnType)64U)',
    '#define RTE_E_MAX_AGE_EXCEEDED ((Std_ReturnType)64U)',
    '#define RTE_E_COM_STOPPED ((Std_ReturnType)128U)',
    '#define RTE_E_TIMEOUT ((Std_ReturnType)129U)',
    '#define RTE_E_LIMIT ((Std_ReturnType)130U)',
    '#define RTE_E_NO_DATA ((Std_ReturnType)131U)',
    '#define RTE_E_TRANSMIT_ACK ((Std_ReturnType)132U)',
    '#define RTE_E_NEVER_RECEIVED ((Std_ReturnType)133U)',
    '#define RTE_E_UNCONNECTED ((Std_ReturnType)134U)',
    '#define RTE_E_IN_EXCLUSIVE_AREA ((Std_ReturnType)135U)',
    '#define RTE_E_SEG_FAULT ((Std_ReturnType)136U)',
    '#define RTE_E_OUT_OF_RANGE ((Std_ReturnType)137U)',
    '',
    '/* Dem event status values passed to SetEventStatus (Dem_EventStatusType). */',
    '#define DEM_EVENT_STATUS_PASSED ((uint8)0x00U)',
    '#define DEM_EVENT_STATUS_FAILED ((uint8)0x01U)',
    '#define DEM_EVENT_STATUS_PREPASSED ((uint8)0x02U)',
    '#define DEM_EVENT_STATUS_PREFAILED ((uint8)0x03U)',
    '',
    '/* Required data ports (sender-receiver, implicit/explicit read). */',
    ...(reads.length > 0 ? reads : ['/* No required data port. */']),
    '',
    '/* Provided data ports (sender-receiver write). */',
    ...(writes.length > 0 ? writes : ['/* No provided data port. */']),
    '',
    '/* Status ports and the Dem client-server operation. */',
    'FUNC(Std_ReturnType, RTE_CODE) Rte_Write_PP_SmStatus_ActiveState(uint16 data);',
    'FUNC(Std_ReturnType, RTE_CODE) Rte_Write_PP_SmStatus_ErrorStatus(uint8 data);',
    'FUNC(Std_ReturnType, RTE_CODE) Rte_Call_RP_SmFaultEvent_SetEventStatus(uint8 EventStatus);',
    '',
    '/* Runnable prototypes are declared in the component header. */',
    '',
    `#endif /* RTE_${ctx.swcUpper}_H */`,
  );
};

export const renderRteStubHeader = (ctx: SwcRenderContext): string => {
  const { swc, ports } = ctx;
  return lines(
    ...banner(`Rte_${swc}_Stub.h`),
    '/* Test API of the host RTE stand-in. */',
    `#ifndef RTE_${ctx.swcUpper}_STUB_H`,
    `#define RTE_${ctx.swcUpper}_STUB_H`,
    '',
    `#include "Rte_${swc}.h"`,
    '',
    '/* Restores the modelled initial values, statuses RTE_E_OK and zero counters. */',
    'void Rte_Stub_Reset(void);',
    '',
    ...ports.required.flatMap((port) => [
      `extern ${port.platformType} Rte_Stub_RP_${port.cName}_${port.dataElementName}_Value;`,
      `extern Std_ReturnType Rte_Stub_RP_${port.cName}_${port.dataElementName}_Status;`,
    ]),
    ...ports.provided.flatMap((port) => [
      `extern ${port.platformType} Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value;`,
      `extern uint32 Rte_Stub_PP_${port.cName}_${port.dataElementName}_WriteCount;`,
    ]),
    'extern uint16 Rte_Stub_PP_SmStatus_ActiveState_Value;',
    'extern uint32 Rte_Stub_PP_SmStatus_ActiveState_WriteCount;',
    'extern uint8 Rte_Stub_PP_SmStatus_ErrorStatus_Value;',
    'extern uint32 Rte_Stub_PP_SmStatus_ErrorStatus_WriteCount;',
    'extern uint8 Rte_Stub_RP_SmFaultEvent_LastStatus;',
    'extern uint32 Rte_Stub_RP_SmFaultEvent_CallCount;',
    '',
    `#endif /* RTE_${ctx.swcUpper}_STUB_H */`,
  );
};

export const renderRteStubSource = (ctx: SwcRenderContext): string => {
  const { swc, ports } = ctx;
  const resets = [
    ...ports.required.flatMap((port) => [
      `    Rte_Stub_RP_${port.cName}_${port.dataElementName}_Value = ${platformInitLiteral(port)};`,
      `    Rte_Stub_RP_${port.cName}_${port.dataElementName}_Status = RTE_E_OK;`,
    ]),
    ...ports.provided.flatMap((port) => [
      `    Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value = ${platformInitLiteral(port)};`,
      `    Rte_Stub_PP_${port.cName}_${port.dataElementName}_WriteCount = 0U;`,
    ]),
  ];
  return lines(
    ...banner(`Rte_${swc}_Stub.c`),
    `#include "Rte_${swc}_Stub.h"`,
    '',
    ...ports.required.flatMap((port) => [
      `${port.platformType} Rte_Stub_RP_${port.cName}_${port.dataElementName}_Value = ${platformInitLiteral(port)};`,
      `Std_ReturnType Rte_Stub_RP_${port.cName}_${port.dataElementName}_Status = RTE_E_OK;`,
    ]),
    ...ports.provided.flatMap((port) => [
      `${port.platformType} Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value = ${platformInitLiteral(port)};`,
      `uint32 Rte_Stub_PP_${port.cName}_${port.dataElementName}_WriteCount = 0U;`,
    ]),
    'uint16 Rte_Stub_PP_SmStatus_ActiveState_Value = 0U;',
    'uint32 Rte_Stub_PP_SmStatus_ActiveState_WriteCount = 0U;',
    'uint8 Rte_Stub_PP_SmStatus_ErrorStatus_Value = 0U;',
    'uint32 Rte_Stub_PP_SmStatus_ErrorStatus_WriteCount = 0U;',
    'uint8 Rte_Stub_RP_SmFaultEvent_LastStatus = 0U;',
    'uint32 Rte_Stub_RP_SmFaultEvent_CallCount = 0U;',
    '',
    'void Rte_Stub_Reset(void)',
    '{',
    ...resets,
    '    Rte_Stub_PP_SmStatus_ActiveState_Value = 0U;',
    '    Rte_Stub_PP_SmStatus_ActiveState_WriteCount = 0U;',
    '    Rte_Stub_PP_SmStatus_ErrorStatus_Value = 0U;',
    '    Rte_Stub_PP_SmStatus_ErrorStatus_WriteCount = 0U;',
    '    Rte_Stub_RP_SmFaultEvent_LastStatus = 0U;',
    '    Rte_Stub_RP_SmFaultEvent_CallCount = 0U;',
    '}',
    ...ports.required.flatMap((port) => [
      '',
      `FUNC(Std_ReturnType, RTE_CODE) Rte_Read_RP_${port.cName}_${port.dataElementName}(P2VAR(${port.platformType}, AUTOMATIC, RTE_APPL_DATA) data)`,
      '{',
      '    Std_ReturnType result = RTE_E_INVALID;',
      '    if (data != NULL_PTR) {',
      `        *data = Rte_Stub_RP_${port.cName}_${port.dataElementName}_Value;`,
      `        result = Rte_Stub_RP_${port.cName}_${port.dataElementName}_Status;`,
      '    }',
      '    return result;',
      '}',
    ]),
    ...ports.provided.flatMap((port) => [
      '',
      `FUNC(Std_ReturnType, RTE_CODE) Rte_Write_PP_${port.cName}_${port.dataElementName}(${port.platformType} data)`,
      '{',
      `    Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value = data;`,
      `    ++Rte_Stub_PP_${port.cName}_${port.dataElementName}_WriteCount;`,
      '    return RTE_E_OK;',
      '}',
    ]),
    '',
    'FUNC(Std_ReturnType, RTE_CODE) Rte_Write_PP_SmStatus_ActiveState(uint16 data)',
    '{',
    '    Rte_Stub_PP_SmStatus_ActiveState_Value = data;',
    '    ++Rte_Stub_PP_SmStatus_ActiveState_WriteCount;',
    '    return RTE_E_OK;',
    '}',
    '',
    'FUNC(Std_ReturnType, RTE_CODE) Rte_Write_PP_SmStatus_ErrorStatus(uint8 data)',
    '{',
    '    Rte_Stub_PP_SmStatus_ErrorStatus_Value = data;',
    '    ++Rte_Stub_PP_SmStatus_ErrorStatus_WriteCount;',
    '    return RTE_E_OK;',
    '}',
    '',
    'FUNC(Std_ReturnType, RTE_CODE) Rte_Call_RP_SmFaultEvent_SetEventStatus(uint8 EventStatus)',
    '{',
    '    Rte_Stub_RP_SmFaultEvent_LastStatus = EventStatus;',
    '    ++Rte_Stub_RP_SmFaultEvent_CallCount;',
    '    return E_OK;',
    '}',
  );
};

/** Three distinct probe values of a port type, as [C expression of the port type, C expression of the core type]. */
const probeValues = (port: AutosarPort): Array<[string, string]> => {
  const core = coreCType(port.platformType);
  if (port.platformType === 'boolean') {
    // With an invalid-input policy the value after a failed read must be distinguishable from the initial value.
    const second = port.invalidInputPolicy !== undefined && port.initValue === '0';
    return second
      ? [['FALSE', 'false'], ['TRUE', 'true'], ['FALSE', 'false']]
      : [['TRUE', 'true'], ['FALSE', 'false'], ['TRUE', 'true']];
  }
  const float = isFloatPlatformType(port.platformType);
  let numbers: number[] = float ? [1.5, 2.5, 3.5] : [1, 2, 3];
  if (port.clampMin !== undefined || port.clampMax !== undefined) {
    const range = INTEGER_RANGES[port.platformType];
    const low = Math.max(port.clampMin ?? (range === undefined ? -1000 : range[0]), -1000);
    const high = Math.min(port.clampMax ?? (range === undefined ? 1000 : range[1]), 1000);
    if (numbers.some((value) => value < low || value > high)) numbers = [low, high, low];
  }
  return numbers.map((value) => [`((${port.platformType})${value})`, `((${core})${value})`]);
};

export const renderUnitTest = (ctx: SwcRenderContext): string => {
  const { swc, ports, swcUpper } = ctx;
  const limit = `${swcUpper}_RTE_ERROR_LIMIT`;
  const dem = 'Rte_Stub_RP_SmFaultEvent_LastStatus';
  const hasFloat = ports.required.some((port) => isFloatPlatformType(port.platformType));
  const writeCount = (port: AutosarPort): string => `Rte_Stub_PP_${port.cName}_${port.dataElementName}_WriteCount`;
  const providedValueMatchesData = (port: AutosarPort): string => port.platformType === 'boolean'
    ? `Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value == (g_inst->data.${port.cName} ? TRUE : FALSE)`
    : `Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value == (${port.platformType})g_inst->data.${port.cName}`;
  /** While the core fault is latched a provided port with a safe value publishes it instead of the data value. */
  const providedValueAfterFault = (port: AutosarPort): string => port.safeValue === undefined
    ? providedValueMatchesData(port)
    : `Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value == ${portLiteral(port.platformType, port.safeValue)}`;

  const safeChecks = (): string[] => ports.provided
    .filter((port) => port.safeValue !== undefined)
    .map((port) => `    CHECK(Rte_Stub_PP_${port.cName}_${port.dataElementName}_Value == ${portLiteral(port.platformType, port.safeValue as number | boolean)}); /* safe value */`);
  const portTests = ports.required.flatMap((port, index) => {
    const value = `Rte_Stub_RP_${port.cName}_${port.dataElementName}_Value`;
    const status = `Rte_Stub_RP_${port.cName}_${port.dataElementName}_Status`;
    const data = `g_inst->data.${port.cName}`;
    const [one, two, three] = probeValues(port);
    const isFloat = isFloatPlatformType(port.platformType);
    const policy = port.invalidInputPolicy;
    const diagnostic = policy === 'diagnostic-fault';
    const initCore = port.platformType === 'boolean'
      ? (port.initValue === '1' ? 'true' : 'false')
      : `((${coreCType(port.platformType)})${platformInitLiteral(port)})`;
    /** What the core holds after a failed read: the last valid value, or the initial value for policy "default". */
    const held = policy === 'default' ? initCore : two[1];
    const heldText = policy === 'default' ? 'initial value substituted (policy default)' : 'last valid value kept';
    const nonFinite = isFloat
      ? [
        ['NAN', '(NaN)'], ['INFINITY', '(+Inf)'], ['-INFINITY', '(-Inf)'],
      ].flatMap(([literal, label]) => [
        `    ${value} = (${port.platformType})${literal};`,
        '    run_cycle();',
        `    CHECK(${data} == ${held}); /* non-finite ${label} rejected, ${heldText} */`,
      ])
      : [];
    const clampTests: string[] = policy !== 'clamp' ? [] : [
      '    /* policy clamp: valid reads are clamped to the mapped channel range; a failed read keeps the last value */',
      ...(port.clampMax === undefined ? [] : [
        `    ${value} = (${port.platformType})(${portLiteral(port.platformType, port.clampMax)} + ${isFloat ? '1.0' : '1'});`,
        '    run_cycle();',
        `    CHECK(${data} == ((${coreCType(port.platformType)})${portLiteral(port.platformType, port.clampMax)}));`,
        `    ${value} = (${port.platformType})${portLiteral(port.platformType, port.clampMax)};`,
        '    run_cycle();',
        `    CHECK(${data} == ((${coreCType(port.platformType)})${portLiteral(port.platformType, port.clampMax)})); /* the bound itself is valid */`,
      ]),
      ...(port.clampMin === undefined ? [] : [
        `    ${value} = (${port.platformType})(${portLiteral(port.platformType, port.clampMin)} - ${isFloat ? '1.0' : '1'});`,
        '    run_cycle();',
        `    CHECK(${data} == ((${coreCType(port.platformType)})${portLiteral(port.platformType, port.clampMin)}));`,
        `    ${value} = (${port.platformType})${portLiteral(port.platformType, port.clampMin)};`,
        '    run_cycle();',
        `    CHECK(${data} == ((${coreCType(port.platformType)})${portLiteral(port.platformType, port.clampMin)})); /* the bound itself is valid */`,
      ]),
      `    ${status} = RTE_E_NO_DATA;`,
      `    ${value} = ${three[0]};`,
      '    run_cycle();',
      `    CHECK(${data} == ((${coreCType(port.platformType)})${portLiteral(port.platformType, (port.clampMin ?? port.clampMax) as number)})); /* failed read: last value kept */`,
      `    ${status} = RTE_E_OK;`,
    ];
    const limitTests = diagnostic
      ? [
        '    /* policy diagnostic-fault: the core fault is latched when the consecutive failures reach the error limit */',
        '    Rte_Stub_Reset();',
        `    ${swc}_Init();`,
        `    ${status} = RTE_E_NO_DATA;`,
        `    for (cycle = 1U; cycle < ${limit}; cycle++) {`,
        '        run_cycle();',
        `        CHECK(${dem} == DEM_EVENT_STATUS_PASSED);`,
        '        CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);',
        '    }',
        '    run_cycle();',
        `    CHECK(${dem} == DEM_EVENT_STATUS_FAILED);`,
        '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value != 0U); /* the core fault is latched */',
        '    CHECK(SM_GetError(g_inst) != SM_ERR_NONE);',
        ...safeChecks(),
        `    ${status} = RTE_E_OK;`,
        '    run_cycle();',
        `    CHECK(${dem} == DEM_EVENT_STATUS_FAILED); /* a good read does not clear a latched core fault */`,
        '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value != 0U);',
        ...safeChecks(),
        `    ${swc}_Init(); /* re-initialisation recovers */`,
        '    run_cycle();',
        `    CHECK(${dem} == DEM_EVENT_STATUS_PASSED);`,
        '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);',
      ]
      : [
        '    /* RTE error limit: reached after exactly the limit of consecutive failures, saturating, cleared by one good read */',
        '    Rte_Stub_Reset();',
        `    ${swc}_Init();`,
        `    ${status} = RTE_E_NO_DATA;`,
        `    for (cycle = 1U; cycle < ${limit}; cycle++) {`,
        '        run_cycle();',
        `        CHECK(${dem} == DEM_EVENT_STATUS_PASSED);`,
        '    }',
        '    run_cycle();',
        `    CHECK(${dem} == DEM_EVENT_STATUS_FAILED);`,
        '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U); /* not a core error */',
        `    for (cycle = 0U; cycle < (${limit} + 2U); cycle++) {`,
        '        run_cycle();',
        '    }',
        `    CHECK(${dem} == DEM_EVENT_STATUS_FAILED);`,
        `    ${status} = RTE_E_OK;`,
        '    run_cycle();',
        `    CHECK(${dem} == DEM_EVENT_STATUS_PASSED);`,
        `    if (${limit} > 1U) {`,
        `        ${status} = RTE_E_NO_DATA;`,
        `        for (cycle = 0U; cycle < ${limit}; cycle++) {`,
        '            run_cycle();',
        '        }',
        `        CHECK(${dem} == DEM_EVENT_STATUS_FAILED);`,
        `        ${swc}_Init(); /* clears every failure counter */`,
        '        run_cycle();',
        `        CHECK(${dem} == DEM_EVENT_STATUS_PASSED);`,
        '    }',
      ];
    return [
      `/* Required port ${port.portName} (${port.platformType}${policy === undefined ? '' : `, invalid-input policy ${policy}`}). */`,
      `static void test_port_${index}(void)`,
      '{',
      '    uint32 cycle;',
      '',
      '    Rte_Stub_Reset();',
      `    ${swc}_Init();`,
      '    /* accept: RTE_E_OK and the overlaid RTE_E_LOST_DATA */',
      `    ${value} = ${one[0]};`,
      `    ${status} = RTE_E_OK;`,
      '    run_cycle();',
      `    CHECK(${data} == ${one[1]});`,
      `    ${value} = ${two[0]};`,
      `    ${status} = RTE_E_LOST_DATA;`,
      '    run_cycle();',
      `    CHECK(${data} == ${two[1]});`,
      `    /* reject: any other status is a failed read (${heldText}) */`,
      `    ${value} = ${three[0]};`,
      `    ${status} = RTE_E_NO_DATA;`,
      '    run_cycle();',
      `    CHECK(${data} == ${held});`,
      `    ${status} = RTE_E_NEVER_RECEIVED;`,
      '    run_cycle();',
      `    CHECK(${data} == ${held});`,
      `    ${status} = RTE_E_INVALID;`,
      '    run_cycle();',
      `    CHECK(${data} == ${held});`,
      `    ${status} = RTE_E_OK;`,
      ...nonFinite,
      `    ${value} = ${one[0]};`,
      '    run_cycle();',
      `    CHECK(${data} == ${one[1]});`,
      ...clampTests,
      '',
      ...limitTests,
      ...(isFloat
        ? [
          '',
          '    /* a stream of non-finite values counts as failed reads */',
          '    Rte_Stub_Reset();',
          `    ${swc}_Init();`,
          `    ${value} = (${port.platformType})NAN;`,
          `    for (cycle = 0U; cycle < ${limit}; cycle++) {`,
          '        run_cycle();',
          '    }',
          `    CHECK(${dem} == DEM_EVENT_STATUS_FAILED);`,
          `    ${value} = ${one[0]};`,
          '    run_cycle();',
          `    CHECK(${dem} == DEM_EVENT_STATUS_${diagnostic ? 'FAILED' : 'PASSED'});`,
        ]
        : []),
      '}',
      '',
    ];
  });

  const firstProvided = ports.provided[0];
  const division = ctx.hasDivision === true;
  const primedValue = (port: AutosarPort): string => probeValues(port)[0][0];
  const primedData = (port: AutosarPort): string => probeValues(port)[0][1];
  const divisionSupport = division
    ? [
      '/* The model divides: a zero divisor is a model fault, so the tests run with valid (non-zero) inputs. */',
      'static void reset_stub(void)',
      '{',
      '    Rte_Stub_Reset();',
      ...ports.required.map((port) => `    Rte_Stub_RP_${port.cName}_${port.dataElementName}_Value = ${primedValue(port)};`),
      '}',
      '',
      'static void init_component(void)',
      '{',
      `    ${swc}_Init();`,
      '#ifdef ADIA_TESTING',
      '    if (g_inst != NULL) {',
      ...ports.required.map((port) => `        g_inst->data.${port.cName} = ${primedData(port)};`),
      '    }',
      '#endif',
      '}',
      '',
    ]
    : [];
  const guarded = (rows: string[]): string[] => (division
    ? rows.map((row) => row
      .replace(/^(\s*)Rte_Stub_Reset\(\);$/, '$1reset_stub();')
      .replace(new RegExp(`^(\\s*)${swc}_Init\\(\\);`), '$1init_component();'))
    : rows).flatMap((row) => (row === '@@DIVISION_SUPPORT@@' ? divisionSupport : [row]));
  return lines(...guarded([
    '/* Generated host unit test of the software component (runs with the RTE stub). */',
    ...traceComment(ctx.fingerprint),
    '#include <stdio.h>',
    ...(hasFloat ? ['#include <math.h>'] : []),
    `#include "${swc}.h"`,
    `#include "Rte_${swc}_Stub.h"`,
    '',
    '#ifdef ADIA_TESTING',
    '#include "sm_core.h"',
    'static ADIA_Instance_t *g_inst = NULL;',
    '#endif',
    '',
    '#define CYCLES 20U',
    '',
    'static int failures = 0;',
    '',
    'static void check(int condition, const char *text, int line)',
    '{',
    '    if (condition == 0) {',
    '        (void)printf("FAIL line %d: %s\\n", line, text);',
    '        ++failures;',
    '    }',
    '}',
    '',
    '#define CHECK(c) check((c) ? 1 : 0, #c, __LINE__)',
    '',
    'static void run_cycle(void)',
    '{',
    `    ${swc}_MainFunction();`,
    '}',
    '',
    '@@DIVISION_SUPPORT@@',
    '#ifdef ADIA_TESTING',
    ...portTests.flat(),
    'static void test_forced_fault(void)',
    '{',
    '    /* A corrupted core (active state cleared) is detected: error status, Dem FAILED, latched. */',
    '    Rte_Stub_Reset();',
    `    ${swc}_Init();`,
    '    CHECK(SM_Test_SetStateActive(g_inst, SM_GetActiveSlot(g_inst, 0U), false) == SM_ERR_NONE);',
    ...(ctx.safetyMode && firstProvided !== undefined
      ? [`    CHECK(${writeCount(firstProvided)} == 1U);`]
      : []),
    '    run_cycle();',
    `    CHECK(${dem} == DEM_EVENT_STATUS_FAILED);`,
    '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value != 0U);',
    ...(ctx.safetyMode
      ? [
        '    /* Safety mode: the safe state was entered and its outputs published by the platform hook. */',
        '    CHECK(SM_GetError(g_inst) != SM_ERR_NONE);',
        ...ports.provided.map((port) => `    CHECK(${providedValueAfterFault(port)});`),
        ...(firstProvided !== undefined ? [`    CHECK(${writeCount(firstProvided)} == 3U); /* hook + runnable */`] : []),
      ]
      : []),
    '    run_cycle();',
    `    CHECK(${dem} == DEM_EVENT_STATUS_FAILED);`,
    '',
    '    /* Re-initialisation recovers. */',
    '    Rte_Stub_Reset();',
    `    ${swc}_Init();`,
    '    run_cycle();',
    `    CHECK(${dem} == DEM_EVENT_STATUS_PASSED);`,
    '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);',
    '}',
    '#endif /* ADIA_TESTING */',
    '',
    'static void test_init_and_cyclic(void)',
    '{',
    '    uint32 cycle;',
    '',
    '    /* Init writes every provided port and both status ports once. */',
    '    Rte_Stub_Reset();',
    `    ${swc}_Init();`,
    ...ports.provided.map((port) => `    CHECK(${writeCount(port)} == 1U);`),
    '    CHECK(Rte_Stub_PP_SmStatus_ActiveState_WriteCount == 1U);',
    '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_WriteCount == 1U);',
    '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);',
    '#ifdef ADIA_TESTING',
    ...ports.provided.map((port) => `    CHECK(${providedValueMatchesData(port)});`),
    '    CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_GetActiveSlot(g_inst, 0U));',
    '#endif',
    `    CHECK(${dem} == 0U);`,
    '    CHECK(Rte_Stub_RP_SmFaultEvent_CallCount == 0U);',
    '',
    '    /* Cyclic execution: no error, ports and the Dem event written every cycle. */',
    '    for (cycle = 1U; cycle <= CYCLES; ++cycle) {',
    '        run_cycle();',
    '        CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);',
    `        CHECK(${dem} == DEM_EVENT_STATUS_PASSED);`,
    '        CHECK(Rte_Stub_RP_SmFaultEvent_CallCount == cycle);',
    '        CHECK(Rte_Stub_PP_SmStatus_ActiveState_WriteCount == (1U + cycle));',
    ...ports.provided.map((port) => `        CHECK(${writeCount(port)} == (1U + cycle));`),
    '#ifdef ADIA_TESTING',
    '        CHECK(Rte_Stub_PP_SmStatus_ActiveState_Value == (uint16)SM_GetActiveSlot(g_inst, 0U));',
    ...ports.provided.map((port) => `        CHECK(${providedValueMatchesData(port)});`),
    '#endif',
    '    }',
    '}',
    '',
    '/* Black-box check available in every build: a failed read does not disturb the cyclic behaviour. */',
    'static void test_failed_read(void)',
    '{',
    ...(ports.required[0] === undefined
      ? ['    /* The model has no required port. */']
      : [
        '    Rte_Stub_Reset();',
        `    ${swc}_Init();`,
        ...(division ? ['    run_cycle(); /* valid data first: a divisor must not still hold its initial value */'] : []),
        `    Rte_Stub_RP_${ports.required[0].cName}_${ports.required[0].dataElementName}_Status = RTE_E_NO_DATA;`,
        '    run_cycle();',
        '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);',
        `    CHECK(${dem} == DEM_EVENT_STATUS_PASSED);`,
        `    Rte_Stub_RP_${ports.required[0].cName}_${ports.required[0].dataElementName}_Status = RTE_E_LOST_DATA;`,
        '    run_cycle();',
        '    CHECK(Rte_Stub_PP_SmStatus_ErrorStatus_Value == 0U);',
      ]),
    '}',
    '',
    'int main(void)',
    '{',
    `    CHECK(${swcUpper}_PERIOD_MS > 0U);`,
    `    CHECK(${limit} > 0U);`,
    '    Rte_Stub_Reset();',
    `    ${swc}_Init();`,
    '#ifdef ADIA_TESTING',
    `    g_inst = ${swc}_Test_GetInstance();`,
    '    if (g_inst == NULL) {',
    '        (void)printf("FAIL: no test instance\\n");',
    '        return 1;',
    '    }',
    '#endif',
    '    test_init_and_cyclic();',
    '    test_failed_read();',
    '#ifdef ADIA_TESTING',
    ...ports.required.map((_port, index) => `    test_port_${index}();`),
    '    test_forced_fault();',
    '#else',
    '    (void)printf("NOTE: white-box tests skipped, build with -DADIA_TESTING (make test does)\\n");',
    '#endif',
    '    if (failures != 0) {',
    '        return 1;',
    '    }',
    '    (void)printf("ALL TESTS PASSED\\n");',
    '    return 0;',
    '}',
  ]));
};

export const renderMakefile = (): string => [
  '# Host build of the AUTOSAR SWC package: builds and runs the unit test and the back-to-back test.',
  '# Usage: make test    (from this directory, or: make -C <dir> test)',
  'CC ?= gcc',
  'CFLAGS ?= -std=c99 -pedantic-errors -Wall -Wextra -Werror',
  '# The host test needs the test hooks (instance access, fault injection); production builds do not define this.',
  'TEST_DEFS = -DADIA_TESTING',
  'INCLUDES = -Iswc -Icore -Istubs',
  'COMMON_SOURCES = $(wildcard swc/*.c) $(wildcard core/*.c) $(wildcard stubs/*.c)',
  '# test/test_<SWC>.c is the unit test, test/test_<SWC>_b2b.c compares the component with the ADIA semantic interpreter.',
  'B2B_SOURCES = $(wildcard test/*_b2b.c)',
  'UNIT_SOURCES = $(filter-out $(B2B_SOURCES),$(wildcard test/*.c))',
  'TARGET = build/swc_host_test',
  'B2B_TARGET = build/swc_b2b_test',
  'HEADERS = $(wildcard swc/*.h) $(wildcard core/*.h) $(wildcard stubs/*.h)',
  '',
  '.PHONY: all test clean',
  '',
  'all: $(TARGET) $(B2B_TARGET)',
  '',
  '$(TARGET): $(COMMON_SOURCES) $(UNIT_SOURCES) $(HEADERS)',
  '\t@mkdir -p build',
  '\t$(CC) $(CFLAGS) $(TEST_DEFS) $(INCLUDES) $(COMMON_SOURCES) $(UNIT_SOURCES) -o $(TARGET) -lm',
  '',
  '$(B2B_TARGET): $(COMMON_SOURCES) $(B2B_SOURCES) $(HEADERS)',
  '\t@mkdir -p build',
  '\t$(CC) $(CFLAGS) $(TEST_DEFS) -DADIA_B2B_MAIN $(INCLUDES) $(COMMON_SOURCES) $(B2B_SOURCES) -o $(B2B_TARGET) -lm',
  '',
  'test: $(TARGET) $(B2B_TARGET)',
  '\t./$(TARGET)',
  '\t./$(B2B_TARGET)',
  '',
  'clean:',
  '\trm -rf build',
  '',
].join('\n');
