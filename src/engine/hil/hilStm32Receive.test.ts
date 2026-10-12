import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateHALCode } from './hilCodeGenerator';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import type { HILConfig, TargetMCU } from './hilTypes';

let hasGcc = true;
try {
  execSync('gcc --version', { stdio: 'ignore' });
} catch {
  hasGcc = false;
}

const config = (target: TargetMCU): HILConfig => ({
  enabled: true,
  target,
  clockSpeed: 16,
  commPort: '',
  baudRate: 115200,
  channels: [
    { id: 'in', name: 'sensor', peripheral: 'GPIO', pin: 'PA0', direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
  ],
  mappings: [{ id: 'm1', adiaVarId: 'v_in', channelId: 'in', direction: 'read' }],
} as HILConfig);

describe.each([['STM32F4', 'huart2', 'USART2'], ['STM32F1', 'huart1', 'USART1']] as const)(
  '%s interrupt-driven UART receive',
  (target, handle, instance) => {
    const files = generateHALCode(config(target), [{ name: 'v_in', type: 'bool' }], [], []);
    const hal = files.find(f => f.name === 'hal_drivers.c')?.content ?? '';

    it('uses HAL_UART_Receive_IT with a re-arming RxCplt callback and a ring buffer', () => {
      expect(hal).toContain(`HAL_UART_Receive_IT(&${handle}`);
      expect(hal).toContain('HAL_UART_RxCpltCallback');
      expect(hal).toContain('hil_rx_ring');
      expect(hal).toContain(`${instance}_IRQHandler`);
      expect(hal).toContain(`HAL_NVIC_EnableIRQ(${instance}_IRQn)`);
    });

    it('clears ORE and re-arms in HAL_UART_ErrorCallback', () => {
      const idx = hal.indexOf('void HAL_UART_ErrorCallback');
      expect(idx).toBeGreaterThan(-1);
      const body = hal.slice(idx, idx + 400);
      expect(body).toContain('__HAL_UART_CLEAR_OREFLAG');
      expect(body).toContain('HAL_UART_Receive_IT');
    });

    it('HIL_Receive_Poll drains the ring buffer instead of polling the UART', () => {
      const idx = hal.indexOf('void HIL_Receive_Poll');
      const body = hal.slice(idx);
      expect(body).toContain('hil_rx_ring');
      expect(body).not.toContain('HAL_UART_Receive(');
    });

    it.skipIf(!hasGcc)('compiles (syntax-only, host gcc) against the generated STM32 test shim', () => {
      const result = generateMISRACCode({
        tickMs: 10,
        states: [{
          id: 's1', name: 'Init', x: 0, y: 0, width: 100, height: 100,
          entry: 'v_in = v_in;', during: '', exit: '',
          isActive: false, color: 'blue', parentId: 'root', children: [],
          priority: 1, isParallel: false, regionId: 'MAIN', autostart: true,
        }],
        junctions: [],
        transitions: [],
        variables: [{ id: 'v1', name: 'v_in', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true }],
        layers: [{ id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }],
        safetyMode: false,
        hilConfig: config(target),
      } as any, { includeTestShims: true });
      expect(result.errors).toHaveLength(0);

      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hil_stm32_'));
      try {
        const shimName = target === 'STM32F4' ? 'stm32f4xx_hal.h' : 'stm32f1xx_hal.h';
        for (const f of result.files) {
          let content = f.content;
          if (f.name === shimName && !content.includes('HAL_UART_Receive_IT')) {
            // Supplement the shim with the interrupt-driven UART API used by the HIL receive path.
            const end = content.lastIndexOf('#endif');
            content = `${content.slice(0, end)}
#define USART1_IRQn 37
#define USART2_IRQn 38
#define USART3_IRQn 39
static inline void HAL_NVIC_SetPriority(int IRQn, uint32_t p, uint32_t s) { (void)IRQn; (void)p; (void)s; }
static inline void HAL_NVIC_EnableIRQ(int IRQn) { (void)IRQn; }
static inline int HAL_UART_Receive_IT(UART_HandleTypeDef* huart, uint8_t* pData, uint16_t Size) { (void)huart; (void)pData; (void)Size; return HAL_OK; }
static inline void HAL_UART_IRQHandler(UART_HandleTypeDef* huart) { (void)huart; }
#define __HAL_UART_CLEAR_OREFLAG(__HANDLE__) ((void)(__HANDLE__))
${content.slice(end)}`;
          }
          fs.writeFileSync(path.join(dir, f.name), content);
        }
        execSync('gcc -std=c99 -Wall -Wextra -Werror -fsyntax-only -I. hal_drivers.c', { cwd: dir, stdio: 'pipe' });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
);
