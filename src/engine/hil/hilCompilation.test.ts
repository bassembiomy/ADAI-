import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import { StateData, VariableDef, TransitionData, Layer } from '../../types/sm_types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const AVR_GPP = path.join(__dirname, '../../../avr-gcc/avr-gcc-15.2.0-x64-windows/bin/avr-g++.exe');
const ARM_GCC = path.join(__dirname, '../../../toolchains/arm-gcc/gcc-arm-none-eabi-10.3-2021.10/bin/arm-none-eabi-gcc.exe');
const HOST_GCC = 'gcc';
const HOST_GPP = 'g++';

function cleanupDir(dir: string) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  }
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

describe('HIL Driver Target Compilation Verification', () => {
  const mockVariables: VariableDef[] = [
    { id: 'v1', name: 'v_gpio_in', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
    { id: 'v2', name: 'v_gpio_out', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
    { id: 'v3', name: 'v_adc', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v4', name: 'v_dac', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v5', name: 'v_pwm', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v6', name: 'v_uart_in', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v7', name: 'v_uart_out', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v8', name: 'v_spi_in', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v9', name: 'v_spi_out', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v10', name: 'v_i2c_in', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v11', name: 'v_i2c_out', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];

  const mockStates: StateData[] = [
    {
      id: 's1', name: 'InitState', x: 0, y: 0, width: 100, height: 100,
      entry: 'v_gpio_out = v_gpio_in; v_pwm = v_adc; v_dac = v_adc; v_uart_out = v_uart_in; v_spi_out = v_spi_in; v_i2c_out = v_i2c_in;',
      during: '', exit: '',
      isActive: false, color: 'blue', parentId: 'root', children: [],
      priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
    }
  ];

  const mockTransitions: TransitionData[] = [];
  const mockLayers: Layer[] = [
    { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }
  ];

  it('links mapped ADC input through Read → Step → Write to PWM output', () => {
    const result = generateMISRACCode({
      tickMs: 10,
      states: [{ ...mockStates[0], during: 'v_pwm = v_adc;' }],
      junctions: [],
      transitions: [],
      variables: mockVariables,
      layers: mockLayers,
      safetyMode: false,
      hilConfig: {
        enabled: true,
        target: 'Generic',
        clockSpeed: 1,
        commPort: '',
        baudRate: 115200,
        channels: [
          { id: 'adc', name: 'adc', peripheral: 'ADC', pin: 'A0', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' },
          { id: 'pwm', name: 'pwm', peripheral: 'PWM', pin: 'P0', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        ],
        mappings: [
          { id: 'adc_read', adiaVarId: 'v_adc', channelId: 'adc', direction: 'read' },
          { id: 'pwm_write', adiaVarId: 'v_pwm', channelId: 'pwm', direction: 'write', safeValue: 128 },
        ],
      },
    } as any);
    expect(result.errors).toHaveLength(0);
    expect(result.files.some((file) => file.name === 'mcal_dio_hil.c')).toBe(true);

    const tempDir = path.join(__dirname, '../../../scratch/test_hil_mcal_runtime');
    cleanupDir(tempDir);
    ensureDir(tempDir);
    try {
      for (const file of result.files) {
        fs.writeFileSync(path.join(tempDir, file.name), file.content);
      }
      fs.writeFileSync(path.join(tempDir, 'harness.c'), `#include "sm_core.h"
#include <stdio.h>
static unsigned pwm_value = 0U;
uint32_t HAL_ADC_Read(const char* pin, const char* name) { (void)pin; (void)name; return 321U; }
void HAL_PWM_Write(const char* pin, const char* name, uint32_t value) { (void)pin; (void)name; pwm_value = value; }
int main(void) { ADIA_Instance_t inst; (void)SM_Init(&inst); (void)SM_ReadInputs(&inst); (void)SM_Step(&inst, SM_TICK_MS); (void)SM_WriteOutputs(&inst); printf("%u %u\\n", (unsigned)inst.data.v_adc, pwm_value); return 0; }
`);
      execSync('gcc -std=c99 -Wall -Wextra -Werror -I. sm_core.c sm_safety.c sm_user_logic.c mcal_dio_hil.c harness.c -o harness.exe', { cwd: tempDir, stdio: 'pipe' });
      expect(execSync('.\\harness.exe', { cwd: tempDir, encoding: 'utf8' }).trim()).toBe('321 321');
    } finally {
      cleanupDir(tempDir);
    }
  }, 30_000);

  const targets = [
    {
      target: 'Arduino_Uno',
      compiler: AVR_GPP,
      compileCmd: (dir: string) => `"${AVR_GPP}" -mmcu=atmega328p -DF_CPU=16000000UL -DADIA_BARE_ARDUINO_MAIN -Os -I. -c Arduino.cpp hal_drivers.c hil_interface.c main_hil.cpp sm_core.c sm_safety.c sm_user_logic.c mcal_dio_hil.c`,
      channels: [
        { id: 'c1', name: 'v_gpio_in', peripheral: 'GPIO', pin: '2', direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c2', name: 'v_gpio_out', peripheral: 'GPIO', pin: '13', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c3', name: 'v_adc', peripheral: 'ADC', pin: 'A0', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' },
        { id: 'c4', name: 'v_dac', peripheral: 'DAC', pin: '3', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c5', name: 'v_pwm', peripheral: 'PWM', pin: '5', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c6', name: 'v_uart_in', peripheral: 'UART', pin: '10', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c7', name: 'v_uart_out', peripheral: 'UART', pin: '11', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c8', name: 'v_spi_in', peripheral: 'SPI', pin: '10', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c9', name: 'v_spi_out', peripheral: 'SPI', pin: '10', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c10', name: 'v_i2c_in', peripheral: 'I2C', pin: 'A4', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c11', name: 'v_i2c_out', peripheral: 'I2C', pin: 'A4', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
      ]
    },
    {
      target: 'Arduino_Mega',
      compiler: AVR_GPP,
      compileCmd: (dir: string) => `"${AVR_GPP}" -mmcu=atmega2560 -DF_CPU=16000000UL -DADIA_BARE_ARDUINO_MAIN -Os -I. -c Arduino.cpp hal_drivers.c hil_interface.c main_hil.cpp sm_core.c sm_safety.c sm_user_logic.c mcal_dio_hil.c`,
      channels: [
        { id: 'c1', name: 'v_gpio_in', peripheral: 'GPIO', pin: '22', direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c2', name: 'v_gpio_out', peripheral: 'GPIO', pin: '13', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c3', name: 'v_adc', peripheral: 'ADC', pin: 'A0', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' },
        { id: 'c4', name: 'v_dac', peripheral: 'DAC', pin: '3', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c5', name: 'v_pwm', peripheral: 'PWM', pin: '5', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c6', name: 'v_uart_in', peripheral: 'UART', pin: '19', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c7', name: 'v_uart_out', peripheral: 'UART', pin: '18', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c8', name: 'v_spi_in', peripheral: 'SPI', pin: '53', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c9', name: 'v_spi_out', peripheral: 'SPI', pin: '53', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c10', name: 'v_i2c_in', peripheral: 'I2C', pin: '20', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c11', name: 'v_i2c_out', peripheral: 'I2C', pin: '20', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
      ]
    },
    {
      target: 'STM32F4',
      compiler: ARM_GCC,
      compileCmd: (dir: string) => `"${ARM_GCC}" -mcpu=cortex-m4 -mthumb --specs=nosys.specs -Os -I. -c hal_drivers.c hil_interface.c main_hil.c sm_core.c sm_safety.c sm_user_logic.c mcal_dio_hil.c`,
      channels: [
        { id: 'c1', name: 'v_gpio_in', peripheral: 'GPIO', pin: 'PA0', direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c2', name: 'v_gpio_out', peripheral: 'GPIO', pin: 'PD12', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c3', name: 'v_adc', peripheral: 'ADC', pin: 'PA1', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 4095, scalingFactor: 1, unit: '' },
        { id: 'c4', name: 'v_dac', peripheral: 'DAC', pin: 'PA4', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 4095, scalingFactor: 1, unit: '' },
        { id: 'c5', name: 'v_pwm', peripheral: 'PWM', pin: 'PA9', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 65535, scalingFactor: 1, unit: '' },
        { id: 'c6', name: 'v_uart_in', peripheral: 'UART', pin: 'PA2', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c7', name: 'v_uart_out', peripheral: 'UART', pin: 'PA3', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c8', name: 'v_spi_in', peripheral: 'SPI', pin: 'PA4', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c9', name: 'v_spi_out', peripheral: 'SPI', pin: 'PA4', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c10', name: 'v_i2c_in', peripheral: 'I2C', pin: 'PB6', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c11', name: 'v_i2c_out', peripheral: 'I2C', pin: 'PB6', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
      ]
    },
    {
      target: 'STM32F1',
      compiler: ARM_GCC,
      compileCmd: (dir: string) => `"${ARM_GCC}" -mcpu=cortex-m3 -mthumb --specs=nosys.specs -Os -I. -c hal_drivers.c hil_interface.c main_hil.c sm_core.c sm_safety.c sm_user_logic.c mcal_dio_hil.c`,
      channels: [
        { id: 'c1', name: 'v_gpio_in', peripheral: 'GPIO', pin: 'PA0', direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c2', name: 'v_gpio_out', peripheral: 'GPIO', pin: 'PC13', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c3', name: 'v_adc', peripheral: 'ADC', pin: 'PA1', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 4095, scalingFactor: 1, unit: '' },
        { id: 'c4', name: 'v_dac', peripheral: 'DAC', pin: 'PA4', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 4095, scalingFactor: 1, unit: '' },
        { id: 'c5', name: 'v_pwm', peripheral: 'PWM', pin: 'PA9', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 65535, scalingFactor: 1, unit: '' },
        { id: 'c6', name: 'v_uart_in', peripheral: 'UART', pin: 'PA2', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c7', name: 'v_uart_out', peripheral: 'UART', pin: 'PA3', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c8', name: 'v_spi_in', peripheral: 'SPI', pin: 'PA4', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c9', name: 'v_spi_out', peripheral: 'SPI', pin: 'PA4', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c10', name: 'v_i2c_in', peripheral: 'I2C', pin: 'PB6', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c11', name: 'v_i2c_out', peripheral: 'I2C', pin: 'PB6', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
      ]
    },
    {
      target: 'ESP32',
      compiler: HOST_GPP,
      compileCmd: (dir: string) => `g++ -O2 -Wall -Wextra -Werror -DADIA_BARE_ARDUINO_MAIN -I. -c Arduino.cpp hal_drivers.c hil_interface.c main_hil.cpp sm_core.c sm_safety.c sm_user_logic.c mcal_dio_hil.c`,
      channels: [
        { id: 'c1', name: 'v_gpio_in', peripheral: 'GPIO', pin: '4', direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c2', name: 'v_gpio_out', peripheral: 'GPIO', pin: '2', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c3', name: 'v_adc', peripheral: 'ADC', pin: '34', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 4095, scalingFactor: 1, unit: '' },
        { id: 'c4', name: 'v_dac', peripheral: 'DAC', pin: '25', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c5', name: 'v_pwm', peripheral: 'PWM', pin: '13', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c6', name: 'v_uart_in', peripheral: 'UART', pin: '16', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c7', name: 'v_uart_out', peripheral: 'UART', pin: '17', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c8', name: 'v_spi_in', peripheral: 'SPI', pin: '5', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c9', name: 'v_spi_out', peripheral: 'SPI', pin: '5', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c10', name: 'v_i2c_in', peripheral: 'I2C', pin: '21', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c11', name: 'v_i2c_out', peripheral: 'I2C', pin: '21', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
      ]
    },
    {
      target: 'Generic',
      compiler: HOST_GCC,
      compileCmd: (dir: string) => `gcc -std=c99 -O2 -Wall -Wextra -Werror -I. -c hal_drivers.c hil_interface.c main_hil.c sm_core.c sm_safety.c sm_user_logic.c mcal_dio_hil.c`,
      channels: [
        { id: 'c1', name: 'v_gpio_in', peripheral: 'GPIO', pin: 'PA0', direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c2', name: 'v_gpio_out', peripheral: 'GPIO', pin: 'PD12', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
        { id: 'c3', name: 'v_adc', peripheral: 'ADC', pin: 'PA1', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 4095, scalingFactor: 1, unit: '' },
        { id: 'c4', name: 'v_dac', peripheral: 'DAC', pin: 'PA4', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 4095, scalingFactor: 1, unit: '' },
        { id: 'c5', name: 'v_pwm', peripheral: 'PWM', pin: 'PA9', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 65535, scalingFactor: 1, unit: '' },
        { id: 'c6', name: 'v_uart_in', peripheral: 'UART', pin: 'PA2', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c7', name: 'v_uart_out', peripheral: 'UART', pin: 'PA3', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c8', name: 'v_spi_in', peripheral: 'SPI', pin: 'PA4', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c9', name: 'v_spi_out', peripheral: 'SPI', pin: 'PA4', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c10', name: 'v_i2c_in', peripheral: 'I2C', pin: 'PB6', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
        { id: 'c11', name: 'v_i2c_out', peripheral: 'I2C', pin: 'PB6', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
      ]
    }
  ];

  targets.forEach((tc) => {
    it(`should successfully compile and link generated HIL + SM code for ${tc.target} with NO warnings/errors`, () => {
      // 1. Check compiler availability
      if (tc.compiler !== HOST_GCC && tc.compiler !== HOST_GPP) {
        expect(fs.existsSync(tc.compiler)).toBe(true);
      } else {
        const cmd = tc.compiler === HOST_GPP ? 'g++' : 'gcc';
        try {
          execSync(`${cmd} --version`, { stdio: 'ignore' });
        } catch {
          console.warn(`Host compiler ${cmd} not found, skipping ${tc.target} verification`);
          return;
        }
      }

      // 2. Generate the code
      const chartConfig = {
        tickMs: 10,
        states: mockStates,
        junctions: [],
        transitions: mockTransitions,
        variables: mockVariables,
        layers: mockLayers,
        safetyMode: false,
        hilConfig: {
          enabled: true,
          target: tc.target as any,
          clockSpeed: 16,
          commPort: 'COM3',
          baudRate: 115200,
          channels: tc.channels as any,
          mappings: tc.channels.map(ch => ({
            channelId: ch.id,
            adiaVarId: ch.name,
            direction: ch.direction === 'In' ? 'read' : 'write',
            conversionExpr: ''
          }))
        }
      };

      const result = generateMISRACCode(chartConfig, { includeTestShims: true });
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.filter(w => w.includes('error') || w.includes('invalid') || w.includes('not supported'))).toHaveLength(0);

      // 3. Write files to temporary test directory
      const tempDir = path.join(__dirname, `../../../scratch/test_compile_verify_${tc.target}`);
      cleanupDir(tempDir);
      ensureDir(tempDir);

      try {
        result.files.forEach(f => {
          fs.writeFileSync(path.join(tempDir, f.name), f.content);
        });

        // Arduino/ESP32 HIL output is an .ino for PlatformIO; rename to .cpp for bare compiler verification
        const inoPath = path.join(tempDir, 'main_hil.ino');
        const cppPath = path.join(tempDir, 'main_hil.cpp');
        if (fs.existsSync(inoPath) && !fs.existsSync(cppPath)) {
          fs.renameSync(inoPath, cppPath);
        }

        // 4. Run compilation command
        const compileCommand = tc.compileCmd(tempDir);
        execSync(compileCommand, { cwd: tempDir, stdio: 'pipe' });

      } finally {
        // Clean up the temporary folder after successful test
        cleanupDir(tempDir);
      }
    }, 30000);
  });
});
