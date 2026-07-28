import { HILConfig } from './hilTypes';
import { hilDriverTemplates } from './hilDriverTemplates';

const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9_]/g, '_');

export function generateHALCode(
  config: HILConfig,
  smVariables: Array<{ name: string; type: string }>,
  warnings?: string[]
): Array<{ name: string; content: string }> {
  if (!config || !config.enabled) {
    return [];
  }

  const target = config.target || 'Generic';
  const mcu = hilDriverTemplates[target] || hilDriverTemplates.Generic;

  /* Surface unsupported-peripheral channels as user-visible diagnostics instead
   * of silently skipping their driver initialization. */
  config.channels.forEach(ch => {
    if (!mcu.peripherals[ch.peripheral]) {
      warnings?.push(`[HIL] Channel '${ch.name}': peripheral '${ch.peripheral}' is not supported by target '${target}'. Its driver initialization was skipped.`);
    }
  });

  /* Warning for STM32-style pins on Arduino/ESP32 targets */
  if (target.startsWith('Arduino') || target === 'ESP32') {
    config.channels.forEach(ch => {
      if (/^P[A-L]\d+$/i.test(ch.pin)) {
        warnings?.push(`[HIL] Channel '${ch.name}': pin '${ch.pin}' uses STM32-style port naming which is invalid on ${target}. Use numeric pins (e.g. '13') or analog pins (e.g. 'A0').`);
      }
    });
  }

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
  .map(ch => `#define PIN_${sanitize(ch.name).toUpperCase()} "${ch.pin}"`)
  .join('\n')}

#endif /* HAL_CONFIG_H */`;

  // 2. hal_drivers.h
  const halDriversH = `${disclaimer}#ifndef HAL_DRIVERS_H
#define HAL_DRIVERS_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include "hal_config.h"

#ifdef TARGET_MCU_STM32F4
#include "stm32f4xx_hal.h"
extern UART_HandleTypeDef huart1;
extern UART_HandleTypeDef huart2;
extern UART_HandleTypeDef huart3;
extern SPI_HandleTypeDef hspi1;
extern ADC_HandleTypeDef hadc1;
extern DAC_HandleTypeDef hdac;
extern TIM_HandleTypeDef htim1;
extern I2C_HandleTypeDef hi2c1;
#elif defined(TARGET_MCU_STM32F1)
#include "stm32f1xx_hal.h"
extern UART_HandleTypeDef huart1;
extern UART_HandleTypeDef huart2;
extern SPI_HandleTypeDef hspi1;
extern ADC_HandleTypeDef hadc1;
extern TIM_HandleTypeDef htim1;
extern I2C_HandleTypeDef hi2c1;
#elif defined(TARGET_MCU_ARDUINO_UNO) || defined(TARGET_MCU_ARDUINO_MEGA) || defined(TARGET_MCU_ESP32)
#include "Arduino.h"
#include "SPI.h"
#include "Wire.h"
#endif

void HAL_Drivers_Init(void);
bool HAL_GPIO_Read(const char* pin, const char* name);
void HAL_GPIO_Write(const char* pin, const char* name, bool value);
uint32_t HAL_ADC_Read(const char* pin, const char* name);
void HAL_DAC_Write(const char* pin, const char* name, uint32_t value);
void HAL_PWM_Write(const char* pin, const char* name, uint32_t value);
uint32_t HAL_UART_Read(const char* pin, const char* name);
void HAL_UART_Write(const char* pin, const char* name, uint32_t value);
uint32_t HAL_SPI_Read(const char* pin, const char* name);
void HAL_SPI_Write(const char* pin, const char* name, uint32_t value);
uint32_t HAL_I2C_Read(const char* pin, const char* name);
void HAL_I2C_Write(const char* pin, const char* name, uint32_t value);
void HIL_SendString(const char* str);
void HIL_Receive_Poll(void);

#endif /* HAL_DRIVERS_H */`;

  // 3. hal_drivers.c
  const gpioReadChannels = config.channels.filter(ch => ch.peripheral === 'GPIO' && ch.direction === 'In');
  const gpioWriteChannels = config.channels.filter(ch => ch.peripheral === 'GPIO' && ch.direction === 'Out');
  const adcChannels = config.channels.filter(ch => ch.peripheral === 'ADC');
  const dacChannels = config.channels.filter(ch => ch.peripheral === 'DAC');
  const pwmChannels = config.channels.filter(ch => ch.peripheral === 'PWM');
  const uartReadChannels = config.channels.filter(ch => ch.peripheral === 'UART' && ch.direction === 'In');
  const uartWriteChannels = config.channels.filter(ch => ch.peripheral === 'UART' && ch.direction === 'Out');
  const spiReadChannels = config.channels.filter(ch => ch.peripheral === 'SPI' && ch.direction === 'In');
  const spiWriteChannels = config.channels.filter(ch => ch.peripheral === 'SPI' && ch.direction === 'Out');
  const i2cReadChannels = config.channels.filter(ch => ch.peripheral === 'I2C' && ch.direction === 'In');
  const i2cWriteChannels = config.channels.filter(ch => ch.peripheral === 'I2C' && ch.direction === 'Out');

  const halDriversC = `${disclaimer}#include "hal_drivers.h"
#include "hal_config.h"
#include "hil_interface.h"
${mcu.systemIncludes}

${mcu.globals}

void HAL_Drivers_Init(void) {
    ${mcu.systemInit.trim()}
    ${mcu.serialInit(config.baudRate).trim()}

    /* Peripherals Initialization */
    ${config.channels
      .map(ch => {
        const p = mcu.peripherals[ch.peripheral];
        return p ? p.init(ch.pin, ch.name, ch.direction).trim() : `/* Unsupported peripheral: ${ch.peripheral} */`;
      })
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

uint32_t HAL_UART_Read(const char* pin, const char* name) {
    (void)pin;
    ${uartReadChannels.length > 0 ? uartReadChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        return ${mcu.peripherals.UART.read(ch.pin, ch.name)};\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
    return 0;
}

void HAL_UART_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    ${uartWriteChannels.length > 0 ? uartWriteChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        ${mcu.peripherals.UART.write(ch.pin, ch.name, 'value')}\n        return;\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
}

uint32_t HAL_SPI_Read(const char* pin, const char* name) {
    (void)pin;
    ${spiReadChannels.length > 0 ? spiReadChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        return ${mcu.peripherals.SPI.read(ch.pin, ch.name)};\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
    return 0;
}

void HAL_SPI_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    ${spiWriteChannels.length > 0 ? spiWriteChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        ${mcu.peripherals.SPI.write(ch.pin, ch.name, 'value')}\n        return;\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
}

uint32_t HAL_I2C_Read(const char* pin, const char* name) {
    (void)pin;
    ${i2cReadChannels.length > 0 ? i2cReadChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        return ${mcu.peripherals.I2C.read(ch.pin, ch.name)};\n    }`)
      .join('\n    ') + '\n    else { /* MISRA 15.7 */ }' : '/* No channels */'}
    return 0;
}

void HAL_I2C_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    ${i2cWriteChannels.length > 0 ? i2cWriteChannels
      .map(ch => `if (strcmp(name, "${ch.name}") == 0) {\n        ${mcu.peripherals.I2C.write(ch.pin, ch.name, 'value')}\n        return;\n    }`)
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
    .map(ch => `static float override_val_${sanitize(ch.name)} = 0.0f;\nstatic bool override_active_${sanitize(ch.name)} = false;`)
    .join('\n');

  // Input synchronization logic
  const inputSyncs = config.mappings
    .filter(m => m.direction === 'read')
    .map(m => {
      const ch = config.channels.find(c => c.id === m.channelId);
      const smVar = smVariables.find(v => v.name === m.adiaVarId);
      if (!ch || !smVar) return '';

      let readCall = '';
      const pinMacro = `PIN_${sanitize(ch.name).toUpperCase()}`;
      if (ch.peripheral === 'GPIO') {
        readCall = `HAL_GPIO_Read(${pinMacro}, "${ch.name}")`;
      } else if (ch.peripheral === 'ADC') {
        readCall = `HAL_ADC_Read(${pinMacro}, "${ch.name}")`;
      } else if (ch.peripheral === 'UART') {
        readCall = `HAL_UART_Read(${pinMacro}, "${ch.name}")`;
      } else if (ch.peripheral === 'SPI') {
        readCall = `HAL_SPI_Read(${pinMacro}, "${ch.name}")`;
      } else if (ch.peripheral === 'I2C') {
        readCall = `HAL_I2C_Read(${pinMacro}, "${ch.name}")`;
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

      return `    if (override_active_${sanitize(ch.name)}) {\n        instance->data.${smVar.name} = override_val_${sanitize(ch.name)};\n    } else {\n        instance->data.${smVar.name} = ${expr};\n    }`;
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

      const pinMacro = `PIN_${sanitize(ch.name).toUpperCase()}`;
      if (ch.peripheral === 'GPIO') {
        return `    HAL_GPIO_Write(${pinMacro}, "${ch.name}", ${valExpr});`;
      } else if (ch.peripheral === 'DAC') {
        return `    HAL_DAC_Write(${pinMacro}, "${ch.name}", (uint32_t)(${valExpr}));`;
      } else if (ch.peripheral === 'PWM') {
        return `    HAL_PWM_Write(${pinMacro}, "${ch.name}", (uint32_t)(${valExpr}));`;
      } else if (ch.peripheral === 'UART') {
        return `    HAL_UART_Write(${pinMacro}, "${ch.name}", (uint32_t)(${valExpr}));`;
      } else if (ch.peripheral === 'SPI') {
        return `    HAL_SPI_Write(${pinMacro}, "${ch.name}", (uint32_t)(${valExpr}));`;
      } else if (ch.peripheral === 'I2C') {
        return `    HAL_I2C_Write(${pinMacro}, "${ch.name}", (uint32_t)(${valExpr}));`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');

  const safeOutputSyncs = config.mappings
    .filter(m => m.direction === 'write')
    .map(m => {
      const ch = config.channels.find(c => c.id === m.channelId);
      if (!ch) return '';
      const safeValue = typeof m.safeValue === 'boolean'
        ? (m.safeValue ? '1' : '0')
        : String(m.safeValue ?? 0);
      const pinMacro = `PIN_${sanitize(ch.name).toUpperCase()}`;
      if (ch.peripheral === 'GPIO') {
        return `        HAL_GPIO_Write(${pinMacro}, "${ch.name}", ${safeValue});`;
      } else if (ch.peripheral === 'DAC') {
        return `        HAL_DAC_Write(${pinMacro}, "${ch.name}", (uint32_t)(${safeValue}));`;
      } else if (ch.peripheral === 'PWM') {
        return `        HAL_PWM_Write(${pinMacro}, "${ch.name}", (uint32_t)(${safeValue}));`;
      } else if (ch.peripheral === 'UART') {
        return `        HAL_UART_Write(${pinMacro}, "${ch.name}", (uint32_t)(${safeValue}));`;
      } else if (ch.peripheral === 'SPI') {
        return `        HAL_SPI_Write(${pinMacro}, "${ch.name}", (uint32_t)(${safeValue}));`;
      } else if (ch.peripheral === 'I2C') {
        return `        HAL_I2C_Write(${pinMacro}, "${ch.name}", (uint32_t)(${safeValue}));`;
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
        const pinMacro = `PIN_${sanitize(ch.name).toUpperCase()}`;
        if (ch.peripheral === 'GPIO') {
          valExpr = `HAL_GPIO_Read(${pinMacro}, "${ch.name}") ? 1.0f : 0.0f`;
        } else if (ch.peripheral === 'ADC') {
          valExpr = `(float)HAL_ADC_Read(${pinMacro}, "${ch.name}")`;
        } else if (ch.peripheral === 'UART') {
          valExpr = `(float)HAL_UART_Read(${pinMacro}, "${ch.name}")`;
        } else if (ch.peripheral === 'SPI') {
          valExpr = `(float)HAL_SPI_Read(${pinMacro}, "${ch.name}")`;
        }
      }
      /* snprintf returns the would-be length; clamp the advance so a truncated
       * segment can never push len past the buffer (MISRA 21.18 / bounds safety). */
      return `    if ((len >= 0) && ((size_t)len < (sizeof(buf) - 32U))) {\n        int remaining = (int)(sizeof(buf) - (size_t)len);\n        int written = snprintf(buf + len, (size_t)remaining, "${ch.name}=%.4f${idx === config.channels.length - 1 ? '' : ';'}", (double)(${valExpr}));\n        if (written > 0) { len += (written < remaining) ? written : (remaining - 1); }\n    }`;
    })
    .join('\n');

  const hilInterfaceC = `${disclaimer}#include "hil_interface.h"
#include "hal_config.h"
#include "hal_drivers.h"
#ifdef SM_SAFETY_ENABLED
#include "sm_safety.h"
#endif
#include "sm_core.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

${overrideGlobals}

void HIL_Sync_Inputs(ADIA_Instance_t* instance) {
${inputSyncs || '    (void)instance;'}
}

void HIL_Sync_Outputs(ADIA_Instance_t* instance) {
#ifdef SM_SAFETY_ENABLED
    /* Run safety validation on state consistency before writing outputs */
    if (SM_Validate_State_Consistency(instance) != SM_ERR_NONE) {
        instance->error_status = SM_ERR_INVALID_STATE;
${safeOutputSyncs || '        (void)instance;'}
        return;
    }
#endif
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
                ch => `if (strcmp(name, "${ch.name}") == 0) {\n                override_val_${sanitize(ch.name)} = val;\n                override_active_${sanitize(ch.name)} = true;\n            } else if (strcmp(name, "${ch.name}_release") == 0) {\n                override_active_${sanitize(ch.name)} = false;\n            }`
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
        if ((len >= 0) && ((size_t)len < (sizeof(buf) - 32U))) {
            int remaining = (int)(sizeof(buf) - (size_t)len);
            int written = snprintf(buf + len, (size_t)remaining, ";ERROR=%d", (int)SM_GetError(instance));
            if (written > 0) { len += (written < remaining) ? written : (remaining - 1); }
        }
    }

    if ((len >= 0) && ((size_t)len < (sizeof(buf) - 2U))) {
        (void)snprintf(buf + len, sizeof(buf) - (size_t)len, "\\n");
    }
    HIL_SendString(buf);
}
`;

  // 6. main_hil.c
  const mainHilC = `${disclaimer}#include "sm_core.h"
#include "hal_drivers.h"
#include "hil_interface.h"
${target.startsWith('Arduino') || target === 'ESP32' ? '#include "Arduino.h"\n' : ''}
${target.startsWith('STM32') ? `#include "${target === 'STM32F4' ? 'stm32f4xx_hal.h' : 'stm32f1xx_hal.h'}"\n` : ''}
${target === 'Generic' ? '#ifdef _WIN32\n#include <windows.h>\n#else\n#include <unistd.h>\n#endif\n' : ''}
ADIA_Instance_t sm_instance;

${target.startsWith('Arduino') || target === 'ESP32'
  ? `void setup(void) {
    /* Initialize peripherals and UART */
    HAL_Drivers_Init();

    /* Initialize State Machine */
    SM_Init(&sm_instance);
}

void loop(void) {
    /* Check for override inputs from dashboard */
    HIL_Receive_Poll();

    /* Read explicitly mapped hardware inputs into the State Machine */
    (void)SM_ReadInputs(&sm_instance);

    /* Tick the State Machine */
    (void)SM_Step(&sm_instance, SM_TICK_MS);

    /* Commit explicitly mapped State Machine outputs */
    (void)SM_WriteOutputs(&sm_instance);

    /* Send back telemetry */
    HIL_SendTelemetry(&sm_instance);

    /* Sleep/Delay */
    ${mcu.tickDelay}
}
`
  : `int main(void) {
    /* Initialize peripherals and UART */
    HAL_Drivers_Init();

    /* Initialize State Machine */
    SM_Init(&sm_instance);

    /* Main Execution Loop */
    while (1) {
        /* Check for override inputs from dashboard */
        HIL_Receive_Poll();

        /* Read explicitly mapped hardware inputs into the State Machine */
        (void)SM_ReadInputs(&sm_instance);

        /* Tick the State Machine */
        (void)SM_Step(&sm_instance, SM_TICK_MS);

        /* Commit explicitly mapped State Machine outputs */
        (void)SM_WriteOutputs(&sm_instance);

        /* Send back telemetry */
        HIL_SendTelemetry(&sm_instance);

        /* Sleep/Delay */
        ${mcu.tickDelay}
    }
}
`}
`;

  // 7. platformio.ini
  let platformioIni = `; =============================================================\n`;
  platformioIni += `;  PlatformIO Configuration - Auto Generated by ADIA Engine\n`;
  platformioIni += `;  Target MCU: ${target}\n`;
  platformioIni += `; =============================================================\n\n`;

  if (target === 'Arduino_Mega') {
    platformioIni += `[env:megaatmega2560]\nplatform = atmelavr\nboard = megaatmega2560\nframework = arduino\nmonitor_speed = ${config.baudRate || 115200}\nbuild_flags =\n    -I. -std=c99\n`;
  } else if (target === 'Arduino_Uno') {
    platformioIni += `[env:uno]\nplatform = atmelavr\nboard = uno\nframework = arduino\nmonitor_speed = ${config.baudRate || 115200}\nbuild_flags =\n    -I. -std=c99\n`;
  } else if (target === 'STM32F4') {
    platformioIni += `[env:stm32f407vg]\nplatform = ststm32\nboard = discovery_f407vg\nframework = stm32cube\nmonitor_speed = ${config.baudRate || 115200}\nbuild_flags =\n    -I. -std=c99\n`;
  } else if (target === 'STM32F1') {
    platformioIni += `[env:bluepill_f103c8]\nplatform = ststm32\nboard = bluepill_f103c8\nframework = stm32cube\nmonitor_speed = ${config.baudRate || 115200}\nbuild_flags =\n    -I. -std=c99\n`;
  } else if (target === 'ESP32') {
    platformioIni += `[env:esp32dev]\nplatform = espressif32\nboard = esp32dev\nframework = arduino\nmonitor_speed = ${config.baudRate || 115200}\nbuild_flags =\n    -I. -std=c99\n`;
  } else {
    platformioIni += `[env:generic]\nplatform = native\nbuild_flags =\n    -I. -std=c99\n`;
  }

  const mainFileName = target.startsWith('Arduino') || target === 'ESP32' ? 'main_hil.ino' : 'main_hil.c';

  // README explaining the entry point and HAL integration per target
  const readmeHil = `# ADIA HIL Generated Project

## Entry Point
- **${target}**: Use \`${mainFileName}\` as the firmware entry point.
  ${target.startsWith('Arduino') || target === 'ESP32' ? '- Arduino framework expects \`setup()\` and \`loop()\` (already generated).' : '- Standard C application with \`int main(void)\`.'}

## HAL/BSP Integration
- The application layer is decoupled from the target MCU.
- Implement the hooks in \`hal_drivers.c\` only if the generated template does not match your board.
- Do **not** modify \`sm_core.c\`, \`sm_user_logic.c\`, or the state machine logic; only map the HAL functions.

## Build
This project is configured for PlatformIO (see \`platformio.ini\`). Open the folder in VS Code with the PlatformIO extension or run \`pio run\` to build and upload.
`;

  return [
    { name: 'hal_config.h', content: halConfigH },
    { name: 'hal_drivers.h', content: halDriversH },
    { name: 'hal_drivers.c', content: halDriversC },
    { name: 'hil_interface.h', content: hilInterfaceH },
    { name: 'hil_interface.c', content: hilInterfaceC },
    { name: mainFileName, content: mainHilC },
    { name: 'platformio.ini', content: platformioIni },
    { name: 'README_HIL.md', content: readmeHil },
  ];
}
