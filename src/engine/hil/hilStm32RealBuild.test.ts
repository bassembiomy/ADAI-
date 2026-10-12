/**
 * Real STM32 firmware build: generated HIL project + official STM32Cube HAL +
 * target-pack startup/linker, compiled and linked with arm-none-eabi-gcc.
 *
 * Runs only when ADIA_ARM_GCC points at an arm-none-eabi-gcc executable
 * (e.g. the xpack 13.3.1-1.1 toolchain) and `npm run fetch:stm32cube` has been run.
 * The pure parts (hal_conf <-> HAL source list consistency, no mock shim in
 * production output) always run.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import { generateStm32HalConf, STM32_HAL_ENABLED_MODULES } from './stm32HalConf';
import type { StateData, VariableDef, Layer } from '../../types/sm_types';

const require_ = createRequire(import.meta.url);
const build = require_('../../security/stm32FirmwareBuild.cjs') as {
  stm32CompileInvocation: (o: Record<string, unknown>) => { executable: string; args: string[]; cwd: string };
  MODULE_SOURCES: Record<string, Record<string, string[]>>;
};

const REPO = path.resolve(__dirname, '../../..');
const VENDOR = path.join(REPO, 'vendor');
const PACKS = path.join(REPO, 'target-packs');
const ARM_GCC = process.env.ADIA_ARM_GCC;
const haveToolchain = Boolean(ARM_GCC && fs.existsSync(ARM_GCC));

type Peripheral = 'GPIO' | 'ADC' | 'DAC' | 'PWM' | 'UART' | 'SPI' | 'I2C';
const ch = (id: string, peripheral: Peripheral, pin: string, direction: 'In' | 'Out', dataType = 'uint16') =>
  ({ id, name: id, peripheral, pin, direction, dataType, rangeMin: 0, rangeMax: 4095, scalingFactor: 1, unit: '' });

const CHANNELS = {
  STM32F4: {
    minimal: [ch('gpio_in', 'GPIO', 'PA0', 'In', 'bool'), ch('gpio_out', 'GPIO', 'PD12', 'Out', 'bool'), ch('adc_in', 'ADC', 'PA1', 'In'), ch('uart_out', 'UART', 'PA3', 'Out')],
    full: [
      ch('gpio_in', 'GPIO', 'PA0', 'In', 'bool'), ch('gpio_out', 'GPIO', 'PD12', 'Out', 'bool'), ch('adc_in', 'ADC', 'PA1', 'In'),
      ch('dac_out', 'DAC', 'PA4', 'Out'), ch('pwm_out', 'PWM', 'PA9', 'Out'), ch('uart_in', 'UART', 'PA2', 'In'), ch('uart_out', 'UART', 'PA3', 'Out'),
      ch('spi_in', 'SPI', 'PA4', 'In'), ch('spi_out', 'SPI', 'PA4', 'Out'), ch('i2c_in', 'I2C', 'PB6', 'In'), ch('i2c_out', 'I2C', 'PB6', 'Out'),
    ],
  },
  STM32F1: {
    minimal: [ch('gpio_in', 'GPIO', 'PA0', 'In', 'bool'), ch('gpio_out', 'GPIO', 'PC13', 'Out', 'bool'), ch('adc_in', 'ADC', 'PA1', 'In'), ch('uart_out', 'UART', 'PA3', 'Out')],
    full: [
      ch('gpio_in', 'GPIO', 'PA0', 'In', 'bool'), ch('gpio_out', 'GPIO', 'PC13', 'Out', 'bool'), ch('adc_in', 'ADC', 'PA1', 'In'),
      ch('pwm_out', 'PWM', 'PA9', 'Out'), ch('uart_in', 'UART', 'PA2', 'In'), ch('uart_out', 'UART', 'PA3', 'Out'),
      ch('spi_in', 'SPI', 'PA4', 'In'), ch('spi_out', 'SPI', 'PA4', 'Out'), ch('i2c_in', 'I2C', 'PB6', 'In'), ch('i2c_out', 'I2C', 'PB6', 'Out'),
    ],
  },
} as const;

function generateProject(target: 'STM32F4' | 'STM32F1', channels: ReadonlyArray<ReturnType<typeof ch>>, includeTestShims: boolean) {
  const variables: VariableDef[] = channels.map((c, i) => ({
    id: `v${i}`, name: c.id, type: c.dataType as VariableDef['type'], initialValue: c.dataType === 'bool' ? 'false' : '0',
    currentValue: c.dataType === 'bool' ? false : 0, visibleInScope: true,
  } as VariableDef));
  const outs = channels.filter((c) => c.direction === 'Out');
  const ins = channels.filter((c) => c.direction === 'In');
  const states: StateData[] = [{
    id: 's1', name: 'InitState', x: 0, y: 0, width: 100, height: 100,
    entry: '', during: outs.map((o) => `${o.id} = ${ins.find((i) => i.dataType === o.dataType)?.id ?? (o.dataType === 'bool' ? 'false' : '0')};`).join(' '),
    exit: '', isActive: false, color: 'blue', parentId: 'root', children: [],
    priority: 1, isParallel: false, regionId: 'MAIN', autostart: true,
  } as StateData];
  const layers: Layer[] = [{ id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] } as Layer];
  return generateMISRACCode({
    tickMs: 10, states, junctions: [], transitions: [], variables, layers, safetyMode: false,
    hilConfig: {
      enabled: true, target, clockSpeed: 16, commPort: 'COM3', baudRate: 115200,
      channels: channels as never,
      mappings: channels.map((c) => ({ id: `m_${c.id}`, channelId: c.id, adiaVarId: c.id, direction: c.direction === 'In' ? 'read' : 'write' })),
    },
  } as never, { includeTestShims });
}

describe('STM32 HAL configuration consistency (pure)', () => {
  for (const family of ['STM32F4', 'STM32F1'] as const) {
    it(`${family}: hal_conf enables exactly the modules whose HAL sources are compiled`, () => {
      expect([...STM32_HAL_ENABLED_MODULES[family]].sort()).toEqual(Object.keys(build.MODULE_SOURCES[family]).sort());
      const conf = generateStm32HalConf(family);
      const enabled = [...conf.content.matchAll(/^#define HAL_([A-Z0-9]+)_MODULE_ENABLED$/gm)].map((m) => m[1]).filter((m) => m !== '');
      expect(enabled.sort()).toEqual([...STM32_HAL_ENABLED_MODULES[family]].sort());
      expect(conf.name).toBe(family === 'STM32F4' ? 'stm32f4xx_hal_conf.h' : 'stm32f1xx_hal_conf.h');
    });
  }

  for (const target of ['STM32F4', 'STM32F1'] as const) {
    it(`${target}: production output (no test shims) has hal_conf and no mock HAL header`, () => {
      const res = generateProject(target, CHANNELS[target].minimal, false);
      expect(res.errors).toHaveLength(0);
      const names = res.files.map((f) => f.name);
      expect(names).toContain(target === 'STM32F4' ? 'stm32f4xx_hal_conf.h' : 'stm32f1xx_hal_conf.h');
      expect(names).not.toContain('stm32f4xx_hal.h');
      expect(names).not.toContain('stm32f1xx_hal.h');
      expect(res.files.some((f) => f.content.includes('STM32_MOCK'))).toBe(false);
      const hal = res.files.find((f) => f.name === 'hal_drivers.c')!.content;
      expect(hal).toContain('void SysTick_Handler(void)');
      expect(hal).toContain('HAL_IncTick();');
      expect(hal).toContain('HIL_SystemClock_Config();');
    });

    it(`${target}: host-test mode (includeTestShims) still emits the mock HAL header`, () => {
      const res = generateProject(target, CHANNELS[target].minimal, true);
      expect(res.files.map((f) => f.name)).toContain(target === 'STM32F4' ? 'stm32f4xx_hal.h' : 'stm32f1xx_hal.h');
    });
  }
});

describe.skipIf(!haveToolchain)('STM32 real HAL link (needs ADIA_ARM_GCC + vendor/stm32cube)', () => {
  const binDir = ARM_GCC ? path.dirname(ARM_GCC) : '';
  const tool = (name: string) => {
    const base = path.join(binDir, `arm-none-eabi-${name}`);
    return fs.existsSync(base) ? base : `${base}.exe`;
  };
  const run = (exe: string, args: string[], cwd: string) =>
    execFileSync(exe, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

  const cases = [
    { target: 'STM32F4' as const, ram: 0x20020000, flashEnd: 0x08100000, cpu: '-mcpu=cortex-m4' },
    { target: 'STM32F1' as const, ram: 0x20005000, flashEnd: 0x08010000, cpu: '-mcpu=cortex-m3' },
  ];

  for (const c of cases) {
    for (const variant of ['minimal', 'full'] as const) {
      it(`${c.target} (${variant} channels): production sources compile warning-free and link to a bootable image`, () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), `adia_${c.target}_${variant}_`));
        try {
          const res = generateProject(c.target, CHANNELS[c.target][variant], false);
          expect(res.errors.map((e) => e.message)).toEqual([]);
          for (const f of res.files) {
            if (f.name.includes('/')) continue;
            fs.writeFileSync(path.join(dir, f.name), f.content);
          }

          const inv = build.stm32CompileInvocation({
            target: c.target, buildDir: dir, vendorDir: VENDOR, targetPacksDir: PACKS, compiler: ARM_GCC,
          });
          expect(inv.cwd).toBe(dir);
          expect(inv.args).toContain('-Wall');
          expect(inv.args).toContain('-Wextra');
          expect(inv.args).toContain('-Wl,--gc-sections');
          expect(inv.args).toContain('-DUSE_HAL_DRIVER');
          expect(inv.args).toContain(c.cpu);

          // 1) Generated production sources: zero warnings under -Wall -Wextra -Werror against the real HAL.
          const generated = fs.readdirSync(dir).filter((f) => f.endsWith('.c'));
          expect(generated.length).toBeGreaterThan(5);
          const compileFlags = inv.args.filter((a) => /^-(D|I|m|O|W(?!l,)|f(function|data))/.test(a));
          for (const src of generated) {
            run(inv.executable, [...compileFlags, '-Werror', '-c', src, '-o', path.join(dir, `${src}.o`)], dir);
          }

          // 2) Full link via the invocation.
          const out = run(inv.executable, inv.args, inv.cwd);
          expect(out).not.toMatch(/undefined reference/);
          const elf = path.join(dir, 'adia_hil.elf');
          expect(fs.existsSync(elf)).toBe(true);

          // 3) Vector table at flash base, SP in RAM, reset vector -> Reset_Handler.
          const sections = run(tool('objdump'), ['-h', elf], dir);
          expect(sections).toMatch(/\.isr_vector\s+[0-9a-f]+\s+08000000\s+08000000/);
          const bin = path.join(dir, 'vec.bin');
          run(tool('objcopy'), ['-O', 'binary', '-j', '.isr_vector', elf, bin], dir);
          const vec = fs.readFileSync(bin);
          const sp = vec.readUInt32LE(0);
          const reset = vec.readUInt32LE(4);
          expect(sp).toBe(c.ram);
          expect(reset & 1).toBe(1);
          expect(reset).toBeGreaterThan(0x08000000);
          expect(reset).toBeLessThan(c.flashEnd);
          const symbols = run(tool('nm'), [elf], dir);
          const symAddr = (name: string) => {
            const m = symbols.match(new RegExp(`^([0-9a-f]+) [TtWw] ${name}$`, 'm'));
            return m ? parseInt(m[1], 16) : undefined;
          };
          expect((symAddr('Reset_Handler') ?? 0) | 1).toBe(reset);
          const systick = vec.readUInt32LE(15 * 4);
          expect(systick).toBe((symAddr('SysTick_Handler') ?? 0) | 1);
          // Application ISR must override the weak default in the vector table.
          const uartIrq = c.target === 'STM32F4' ? 'USART2_IRQHandler' : 'USART1_IRQHandler';
          expect(symAddr(uartIrq)).toBeDefined();
          expect(symAddr(uartIrq)).not.toBe(symAddr('Default_Handler'));

          // 4) Real HAL linked in; no mock/stub symbols; no unresolved symbols.
          for (const needed of ['HAL_Init', 'HAL_UART_Init', 'HAL_UART_Transmit', 'HAL_GPIO_Init', 'HAL_RCC_OscConfig', 'SysTick_Handler', 'SystemInit', 'main']) {
            expect(symAddr(needed), `${needed} missing from image`).toBeDefined();
          }
          expect(symbols).not.toMatch(/STM32_MOCK|mock|stub/i);
          // Telemetry formats floats; nano.specs would silently print nothing without these.
          expect(symbols).toMatch(/ _printf_float$/m);
          expect(symbols).toMatch(/ _scanf_float$/m);
          expect(run(tool('nm'), ['-u', elf], dir).trim()).toBe('');
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }, 180_000);
    }
  }
});
