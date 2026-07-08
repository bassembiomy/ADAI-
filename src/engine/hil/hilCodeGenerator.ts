import { HILConfig } from './hilTypes';
import { hilDriverTemplates } from './hilDriverTemplates';

export function generateHALCode(
  config: HILConfig,
  smVariables: Array<{ name: string; type: string }>
): Array<{ name: string; content: string }> {
  if (!config || !config.enabled) {
    return [];
  }

  const target = config.target || 'Generic';
  const mcu = hilDriverTemplates[target] || hilDriverTemplates.Generic;

  const disclaimer = `/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: ${target} (${mcu.name})                          */
/*  Baud Rate: ${config.baudRate}                                */
/*  Do not modify this file manually                             */
/* ============================================================= */\n\n`;

  // 1. hal_config.h
  const halConfigH = `${disclaimer}#ifndef HAL_CONFIG_H
#define HAL_CONFIG_H

#define TARGET_MCU_${target.toUpperCase()}
#define HIL_BAUDRATE ${config.baudRate || 115200}U
#define SYSTEM_CLOCK_MHZ ${config.clockSpeed || 16}U

/* Channels Pin Mappings */
${config.channels
  .map(ch => `#define PIN_${ch.name.toUpperCase()} "${ch.pin}"`)
  .join('\n')}

#endif /* HAL_CONFIG_H */`;

  // 2. hal_drivers.h
  const halDriversH = `${disclaimer}#ifndef HAL_DRIVERS_H
#define HAL_DRIVERS_H

#include <stdint.h>
#include <stdbool.h>
#include "hal_config.h"

void HAL_Drivers_Init(void);
bool HAL_GPIO_Read(const char* pin, const char* name);
void HAL_GPIO_Write(const char* pin, const char* name, bool value);
uint32_t HAL_ADC_Read(const char* pin, const char* name);
void HAL_DAC_Write(const char* pin, const char* name, uint32_t value);
void HAL_PWM_Write(const char* pin, const char* name, uint32_t value);
void HIL_SendString(const char* str);
void HIL_Receive_Poll(void);

#endif /* HAL_DRIVERS_H */`;

  // 3. hal_drivers.c
  const gpioReadChannels = config.channels.filter(ch => ch.peripheral === 'GPIO' && ch.direction === 'In');
  const gpioWriteChannels = config.channels.filter(ch => ch.peripheral === 'GPIO' && ch.direction === 'Out');
  const adcChannels = config.channels.filter(ch => ch.peripheral === 'ADC');
  const dacChannels = config.channels.filter(ch => ch.peripheral === 'DAC');
  const pwmChannels = config.channels.filter(ch => ch.peripheral === 'PWM');

  const halDriversC = `${disclaimer}#include "hal_drivers.h"
#include "hil_interface.h"
${mcu.systemIncludes}

${mcu.globals}

void HAL_Drivers_Init(void) {
    ${mcu.systemInit.trim()}
    ${mcu.serialInit(config.baudRate).trim()}

    /* Peripherals Initialization */
    ${config.channels
      .map(ch => mcu.peripherals[ch.peripheral].init(ch.pin, ch.name, ch.direction).trim())
      .filter(Boolean)
      .join('\n    ')}
}

bool HAL_GPIO_Read(const char* pin, const char* name) {
    (void)pin;
    ${gpioReadChannels.length > 0 ? gpioReadChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        return ${mcu.peripherals.GPIO.read(ch.pin, ch.name)};\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
    return false;
}

void HAL_GPIO_Write(const char* pin, const char* name, bool value) {
    (void)pin;
    ${gpioWriteChannels.length > 0 ? gpioWriteChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        ${mcu.peripherals.GPIO.write(ch.pin, ch.name, 'value')}\n        return;\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
}

uint32_t HAL_ADC_Read(const char* pin, const char* name) {
    (void)pin;
    ${adcChannels.length > 0 ? adcChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        return ${mcu.peripherals.ADC.read(ch.pin, ch.name)};\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
    return 0;
}

void HAL_DAC_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    ${dacChannels.length > 0 ? dacChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        ${mcu.peripherals.DAC.write(ch.pin, ch.name, 'value')}\n        return;\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
}

void HAL_PWM_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    ${pwmChannels.length > 0 ? pwmChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        ${mcu.peripherals.PWM.write(ch.pin, ch.name, 'value')}\n        return;\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
}

${mcu.serialTransmit.trim()}

void HIL_Receive_Poll(void) {
    ${mcu.serialReceive.trim()}
}
`;

  // 4. hil_interface.h
  const hilInterfaceH = `${disclaimer}#ifndef HIL_INTERFACE_H
#define HIL_INTERFACE_H

#include "sm_config.h"

void HIL_Sync_Inputs(ADIA_Instance_t* instance);
void HIL_Sync_Outputs(ADIA_Instance_t* instance);
void HIL_ProcessMessage(const char* msg);
void HIL_SendTelemetry(ADIA_Instance_t* instance);

#endif /* HIL_INTERFACE_H */`;

  // 5. hil_interface.c
  // Define override states for input channels
  const inputChannels = config.channels.filter(ch => ch.direction === 'In');
  const overrideGlobals = inputChannels
    .map(ch => `static float override_val_${ch.name} = 0.0f;\nstatic bool override_active_${ch.name} = false;`)
    .join('\n');

  // Input synchronization logic
  const inputSyncs = config.mappings
    .filter(m => m.direction === 'read')
    .map(m => {
      const ch = config.channels.find(c => c.id === m.channelId);
      const smVar = smVariables.find(v => v.name === m.adiaVarId);
      if (!ch || !smVar) return '';

      let readCall = '';
      if (ch.peripheral === 'GPIO') {
        readCall = `HAL_GPIO_Read(PIN_${ch.name.toUpperCase()}, "${ch.name}")`;
      } else if (ch.peripheral === 'ADC') {
        readCall = `HAL_ADC_Read(PIN_${ch.name.toUpperCase()}, "${ch.name}")`;
      } else {
        readCall = `0`;
      }

      let expr = readCall;
      if (ch.scalingFactor && ch.scalingFactor !== 1) {
        expr = `((float)(${readCall}) * ${ch.scalingFactor}f)`;
      }

      if (m.conversionExpr) {
        expr = m.conversionExpr.replace(/\bx\b/g, `((float)(${readCall}))`);
      }

      return `    if (override_active_${ch.name}) {\n        instance->data.${smVar.name} = override_val_${ch.name};\n    } else {\n        instance->data.${smVar.name} = ${expr};\n    }`;
    })
    .filter(Boolean)
    .join('\n');

  // Output synchronization logic
  const outputSyncs = config.mappings
    .filter(m => m.direction === 'write')
    .map(m => {
      const ch = config.channels.find(c => c.id === m.channelId);
      const smVar = smVariables.find(v => v.name === m.adiaVarId);
      if (!ch || !smVar) return '';

      let valExpr = `instance->data.${smVar.name}`;
      if (ch.scalingFactor && ch.scalingFactor !== 1) {
        valExpr = `((float)(${valExpr}) * ${ch.scalingFactor}f)`;
      }

      if (m.conversionExpr) {
        valExpr = m.conversionExpr.replace(/\bx\b/g, `((float)(${valExpr}))`);
      }

      if (ch.peripheral === 'GPIO') {
        return `    HAL_GPIO_Write(PIN_${ch.name.toUpperCase()}, "${ch.name}", ${valExpr});`;
      } else if (ch.peripheral === 'DAC') {
        return `    HAL_DAC_Write(PIN_${ch.name.toUpperCase()}, "${ch.name}", (uint32_t)(${valExpr}));`;
      } else if (ch.peripheral === 'PWM') {
        return `    HAL_PWM_Write(PIN_${ch.name.toUpperCase()}, "${ch.name}", (uint32_t)(${valExpr}));`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');

  // Telemetry output composed of all channels
  const telemetryCompositions = config.channels
    .map((ch, idx) => {
      const mapping = config.mappings.find(m => m.channelId === ch.id);
      let valExpr = '0.0f';
      if (mapping) {
        valExpr = `instance->data.${mapping.adiaVarId}`;
      } else {
        if (ch.peripheral === 'GPIO') {
          valExpr = `HAL_GPIO_Read(PIN_${ch.name.toUpperCase()}, "${ch.name}") ? 1.0f : 0.0f`;
        } else if (ch.peripheral === 'ADC') {
          valExpr = `(float)HAL_ADC_Read(PIN_${ch.name.toUpperCase()}, "${ch.name}")`;
        }
      }
      return `    if (len < (int)(sizeof(buf) - 32U)) {\n        len += snprintf(buf + len, sizeof(buf) - (size_t)len, "${ch.name}=%.4f${idx === config.channels.length - 1 ? '' : ';'}", (double)(${valExpr}));\n    }`;
    })
    .join('\n');

  const hilInterfaceC = `${disclaimer}#include "hil_interface.h"
#include "hal_drivers.h"
#include "sm_safety.h"
#include "sm_core.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

${overrideGlobals}

void HIL_Sync_Inputs(ADIA_Instance_t* instance) {
${inputSyncs || '    (void)instance;'}
}

void HIL_Sync_Outputs(ADIA_Instance_t* instance) {
${outputSyncs || '    (void)instance;'}
}

void HIL_ProcessMessage(const char* msg) {
    char temp[256];
    strncpy(temp, msg, sizeof(temp));
    temp[sizeof(temp)-1] = '\\0';
    
    char* p = temp;
    while (*p != '\\0') {
        char* token = p;
        while (*p != '\\0' && *p != ';') {
            p++;
        }
        if (*p == ';') {
            *p = '\\0';
            p++;
        }
        
        char name[64];
        float val = 0.0f;
        if (sscanf(token, "%63[^=]=%f", name, &val) == 2) {
            ${inputChannels.length > 0 ? inputChannels
              .map(
                ch => `if (strcmp(name, "${ch.name}") == 0) {\n                override_val_${ch.name} = val;\n                override_active_${ch.name} = true;\n            } else if (strcmp(name, "${ch.name}_release") == 0) {\n                override_active_${ch.name} = false;\n            }`
              )
              .join(' else ') + '\n            else { /* MISRA 15.7 */ }' : '/* No input channels */'}
        }
    }
}

void HIL_SendTelemetry(ADIA_Instance_t* instance) {
    char buf[512];
    int len = 0;
    (void)instance;
${telemetryCompositions || '    len += snprintf(buf + len, sizeof(buf) - (size_t)len, "info=no_channels");'}
    
    if (SM_GetError(instance) != SM_ERR_NONE) {
        len += snprintf(buf + len, sizeof(buf) - (size_t)len, ";ERROR=%d", (int)SM_GetError(instance));
    }
    
    (void)snprintf(buf + len, sizeof(buf) - (size_t)len, "\\n");
    HIL_SendString(buf);
}
`;

  // 6. main_hil.c
  const mainHilC = `${disclaimer}#include "sm_core.h"
#include "hal_drivers.h"
#include "hil_interface.h"
${target.startsWith('Arduino') || target === 'ESP32' ? '#include "Arduino.h"\n' : ''}

ADIA_Instance_t sm_instance;

int main(void) {
    /* Initialize peripherals and UART */
    HAL_Drivers_Init();

    /* Initialize State Machine */
    SM_Init(&sm_instance);

    /* Main Execution Loop */
    while (1) {
        /* Check for override inputs from dashboard */
        HIL_Receive_Poll();

        /* Synchronize hardware inputs to State Machine */
        HIL_Sync_Inputs(&sm_instance);

        /* Tick the State Machine */
        SM_Step(&sm_instance, SM_TICK_MS);

        /* Synchronize State Machine outputs to hardware */
        HIL_Sync_Outputs(&sm_instance);

        /* Send back telemetry */
        HIL_SendTelemetry(&sm_instance);

        /* Sleep/Delay */
        ${mcu.tickDelay}
    }
    return 0;
}
`;

  return [
    { name: 'hal_config.h', content: halConfigH },
    { name: 'hal_drivers.h', content: halDriversH },
    { name: 'hal_drivers.c', content: halDriversC },
    { name: 'hil_interface.h', content: hilInterfaceH },
    { name: 'hil_interface.c', content: hilInterfaceC },
    { name: 'main_hil.c', content: mainHilC },
  ];
}
