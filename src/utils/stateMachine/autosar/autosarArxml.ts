import type { AutosarPort } from './autosarPorts';
import type { SwcRenderContext } from './autosarSwc';

const TYPE_PATH = '/AUTOSAR_Platform/ImplementationDataTypes';

export const xmlEscape = (text: string): string => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const periodSeconds = (tickMs: number): string => {
  const seconds = tickMs / 1000;
  const text = String(seconds);
  return /e/i.test(text) ? seconds.toFixed(9).replace(/0+$/, '').replace(/\.$/, '.0') : text;
};

type Node = string[];

const el = (tag: string, children: Node[] | string, attrs = ''): Node => {
  const open = attrs === '' ? `<${tag}>` : `<${tag} ${attrs}>`;
  if (typeof children === 'string') return [`${open}${xmlEscape(children)}</${tag}>`];
  return [open, ...children.flat().map((line) => `  ${line}`), `</${tag}>`];
};

const ref = (tag: string, dest: string, path: string): Node =>
  [`<${tag} DEST="${xmlEscape(dest)}">${xmlEscape(path)}</${tag}>`];

const name = (value: string): Node => el('SHORT-NAME', value);

const typeRef = (platformType: string): Node =>
  ref('TYPE-TREF', 'IMPLEMENTATION-DATA-TYPE', `${TYPE_PATH}/${platformType}`);

const dataPrototype = (elementName: string, platformType: string): Node =>
  el('VARIABLE-DATA-PROTOTYPE', [name(elementName), typeRef(platformType)]);

const srInterface = (interfaceName: string, elementName: string, platformType: string): Node =>
  el('SENDER-RECEIVER-INTERFACE', [
    name(interfaceName),
    el('IS-SERVICE', 'false'),
    el('DATA-ELEMENTS', [dataPrototype(elementName, platformType)]),
  ]);

const initValue = (value: string): Node =>
  el('INIT-VALUE', [el('NUMERICAL-VALUE-SPECIFICATION', [el('VALUE', value)])]);

export const renderArxml = (ctx: SwcRenderContext): string => {
  const { swc, ports, tickMs } = ctx;
  const root = `/${swc}`;
  const interfacesPath = `${root}/Interfaces`;
  const componentPath = `${root}/ComponentTypes/${swc}`;
  const behaviorName = `${swc}_InternalBehavior`;
  const behaviorPath = `${componentPath}/${behaviorName}`;
  const initRunnable = `${swc}_Init`;
  const mainRunnable = `${swc}_MainFunction`;
  const statusElements: Array<{ name: string; type: string; init: string }> = [
    { name: 'ActiveState', type: 'uint16', init: '0' },
    { name: 'ErrorStatus', type: 'uint8', init: '0' },
  ];

  const interfaceFor = (port: AutosarPort): Node =>
    srInterface(port.interfaceName, port.dataElementName, port.platformType);
  const statusInterface = el('SENDER-RECEIVER-INTERFACE', [
    name('SRI_SmStatus'),
    el('IS-SERVICE', 'false'),
    el('DATA-ELEMENTS', statusElements.map((item) => dataPrototype(item.name, item.type))),
  ]);
  const demInterface = el('CLIENT-SERVER-INTERFACE', [
    name('CSI_DemEvent'),
    el('IS-SERVICE', 'true'),
    el('OPERATIONS', [
      el('CLIENT-SERVER-OPERATION', [
        name('SetEventStatus'),
        el('ARGUMENTS', [
          el('ARGUMENT-DATA-PROTOTYPE', [
            name('EventStatus'),
            typeRef('uint8'),
            el('DIRECTION', 'IN'),
          ]),
        ]),
      ]),
    ]),
  ]);

  const providedPort = (portName: string, interfaceName: string, elements: Array<{ element: string; init: string }>): Node =>
    el('P-PORT-PROTOTYPE', [
      name(portName),
      el('PROVIDED-COM-SPECS', elements.map((item) => el('NONQUEUED-SENDER-COM-SPEC', [
        ref('DATA-ELEMENT-REF', 'VARIABLE-DATA-PROTOTYPE', `${interfacesPath}/${interfaceName}/${item.element}`),
        initValue(item.init),
      ]))),
      ref('PROVIDED-INTERFACE-TREF', 'SENDER-RECEIVER-INTERFACE', `${interfacesPath}/${interfaceName}`),
    ]);
  const requiredPort = (port: AutosarPort): Node =>
    el('R-PORT-PROTOTYPE', [
      name(port.portName),
      el('REQUIRED-COM-SPECS', [
        el('NONQUEUED-RECEIVER-COM-SPEC', [
          ref('DATA-ELEMENT-REF', 'VARIABLE-DATA-PROTOTYPE', `${interfacesPath}/${port.interfaceName}/${port.dataElementName}`),
          el('ALIVE-TIMEOUT', '0'),
          el('ENABLE-UPDATE', 'false'),
          el('HANDLE-NEVER-RECEIVED', 'false'),
          initValue(port.initValue),
        ]),
      ]),
      ref('REQUIRED-INTERFACE-TREF', 'SENDER-RECEIVER-INTERFACE', `${interfacesPath}/${port.interfaceName}`),
    ]);
  const faultPort = el('R-PORT-PROTOTYPE', [
    name('RP_SmFaultEvent'),
    el('REQUIRED-COM-SPECS', [
      el('CLIENT-COM-SPEC', [
        ref('OPERATION-REF', 'CLIENT-SERVER-OPERATION', `${interfacesPath}/CSI_DemEvent/SetEventStatus`),
      ]),
    ]),
    ref('REQUIRED-INTERFACE-TREF', 'CLIENT-SERVER-INTERFACE', `${interfacesPath}/CSI_DemEvent`),
  ]);

  const variableAccess = (
    accessName: string,
    portKind: 'P-PORT-PROTOTYPE' | 'R-PORT-PROTOTYPE',
    portName: string,
    interfaceName: string,
    element: string,
  ): Node => el('VARIABLE-ACCESS', [
    name(accessName),
    el('ACCESSED-VARIABLE', [
      el('AUTOSAR-VARIABLE-IREF', [
        ref('PORT-PROTOTYPE-REF', portKind, `${componentPath}/${portName}`),
        ref('TARGET-DATA-PROTOTYPE-REF', 'VARIABLE-DATA-PROTOTYPE', `${interfacesPath}/${interfaceName}/${element}`),
      ]),
    ]),
  ]);
  const writeAccesses = [
    ...ports.provided.map((port) => variableAccess(
      `WA_${port.portName}_${port.dataElementName}`, 'P-PORT-PROTOTYPE', port.portName, port.interfaceName, port.dataElementName)),
    ...statusElements.map((item) => variableAccess(
      `WA_PP_SmStatus_${item.name}`, 'P-PORT-PROTOTYPE', 'PP_SmStatus', 'SRI_SmStatus', item.name)),
  ];
  const readAccesses = ports.required.map((port) => variableAccess(
    `RA_${port.portName}_${port.dataElementName}`, 'R-PORT-PROTOTYPE', port.portName, port.interfaceName, port.dataElementName));

  const initRunnableNode = el('RUNNABLE-ENTITY', [
    name(initRunnable),
    el('CAN-BE-INVOKED-CONCURRENTLY', 'false'),
    el('DATA-WRITE-ACCESSS', writeAccesses),
    el('SYMBOL', initRunnable),
  ]);
  const mainRunnableNode = el('RUNNABLE-ENTITY', [
    name(mainRunnable),
    el('CAN-BE-INVOKED-CONCURRENTLY', 'false'),
    ...(readAccesses.length > 0 ? [el('DATA-READ-ACCESSS', readAccesses)] : []),
    el('DATA-WRITE-ACCESSS', writeAccesses),
    el('SERVER-CALL-POINTS', [
      el('SYNCHRONOUS-SERVER-CALL-POINT', [
        name('SCP_SmFaultEvent_SetEventStatus'),
        el('OPERATION-IREF', [
          ref('CONTEXT-R-PORT-REF', 'R-PORT-PROTOTYPE', `${componentPath}/RP_SmFaultEvent`),
          ref('TARGET-REQUIRED-OPERATION-REF', 'CLIENT-SERVER-OPERATION', `${interfacesPath}/CSI_DemEvent/SetEventStatus`),
        ]),
        el('TIMEOUT', '0'),
      ]),
    ]),
    el('SYMBOL', mainRunnable),
  ]);

  const component = el('APPLICATION-SW-COMPONENT-TYPE', [
    name(swc),
    el('PORTS', [
      ...ports.provided.map((port) => providedPort(
        port.portName, port.interfaceName, [{ element: port.dataElementName, init: port.initValue }])),
      providedPort('PP_SmStatus', 'SRI_SmStatus', statusElements.map((item) => ({ element: item.name, init: item.init }))),
      ...ports.required.map(requiredPort),
      faultPort,
    ]),
    el('INTERNAL-BEHAVIORS', [
      el('SWC-INTERNAL-BEHAVIOR', [
        name(behaviorName),
        el('EVENTS', [
          el('INIT-EVENT', [
            name('IE_Init'),
            ref('START-ON-EVENT-REF', 'RUNNABLE-ENTITY', `${behaviorPath}/${initRunnable}`),
          ]),
          el('TIMING-EVENT', [
            name('TE_MainFunction'),
            ref('START-ON-EVENT-REF', 'RUNNABLE-ENTITY', `${behaviorPath}/${mainRunnable}`),
            el('PERIOD', periodSeconds(tickMs)),
          ]),
        ]),
        el('RUNNABLES', [initRunnableNode, mainRunnableNode]),
      ]),
    ]),
  ]);

  const implementation = el('SWC-IMPLEMENTATION', [
    name(`${swc}_Implementation`),
    el('CODE-DESCRIPTORS', [
      el('CODE', [
        name('Code'),
        el('ARTIFACT-DESCRIPTORS', [
          el('AUTOSAR-ENGINEERING-OBJECT', [
            el('SHORT-LABEL', `${swc}.c`),
            el('CATEGORY', 'SWSRC'),
          ]),
        ]),
      ]),
    ]),
    el('PROGRAMMING-LANGUAGE', 'C'),
    el('SW-VERSION', '1.0.0'),
    el('USED-CODE-GENERATOR', 'ADIA AUTOSAR generator'),
    ref('BEHAVIOR-REF', 'SWC-INTERNAL-BEHAVIOR', behaviorPath),
  ]);

  const document: Node = el('AR-PACKAGES', [
      el('AR-PACKAGE', [
        name(swc),
        el('AR-PACKAGES', [
          el('AR-PACKAGE', [
            name('Interfaces'),
            el('ELEMENTS', [
              ...[...ports.provided, ...ports.required].map(interfaceFor),
              statusInterface,
              demInterface,
            ]),
          ]),
          el('AR-PACKAGE', [name('ComponentTypes'), el('ELEMENTS', [component])]),
          el('AR-PACKAGE', [name('Implementations'), el('ELEMENTS', [implementation])]),
        ]),
      ]),
    ]);

  const header = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00049.xsd">',
  ];
  return `${[...header, ...document.map((line) => `  ${line}`), '</AUTOSAR>'].join('\n')}\n`;
};
