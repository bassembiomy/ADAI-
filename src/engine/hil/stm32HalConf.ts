/**
 * Generates the `stm32f?xx_hal_conf.h` that the official STM32Cube HAL requires.
 *
 * Only the HAL modules the generated HIL firmware actually uses are enabled.
 * The same module list is mirrored by `src/security/stm32FirmwareBuild.cjs`
 * (HAL_SOURCES), which compiles exactly the matching `Src/*.c` files; a unit test
 * keeps the two in sync.
 *
 * Clock configuration (documented v1 choice): no PLL, no HSE. The MCU keeps its
 * reset clock source, the internal HSI oscillator (F4: 16 MHz, F1: 8 MHz).
 * HSE_VALUE is still defined for the board crystal so system_stm32f?xx.c and
 * the RCC driver compile with their normal defaults.
 */

export type Stm32HalFamily = 'STM32F4' | 'STM32F1';

/** Modules (upper-case, as in `HAL_<NAME>_MODULE_ENABLED`) per family. */
export const STM32_HAL_ENABLED_MODULES: Record<Stm32HalFamily, readonly string[]> = {
  STM32F4: ['ADC', 'CORTEX', 'DAC', 'DMA', 'FLASH', 'GPIO', 'I2C', 'PWR', 'RCC', 'SPI', 'TIM', 'UART'],
  STM32F1: ['ADC', 'CORTEX', 'DMA', 'FLASH', 'GPIO', 'I2C', 'PWR', 'RCC', 'SPI', 'TIM', 'UART'],
};

/** Order in which module headers are included (RCC/GPIO/DMA/CORTEX first, as in the ST template). */
const INCLUDE_ORDER = ['RCC', 'GPIO', 'DMA', 'CORTEX', 'ADC', 'DAC', 'FLASH', 'I2C', 'PWR', 'SPI', 'TIM', 'UART'];

export function generateStm32HalConf(family: Stm32HalFamily): { name: string; content: string } {
  const prefix = family === 'STM32F4' ? 'stm32f4xx' : 'stm32f1xx';
  const guard = family === 'STM32F4' ? '__STM32F4xx_HAL_CONF_H' : '__STM32F1xx_HAL_CONF_H';
  const modules = STM32_HAL_ENABLED_MODULES[family];
  const enabled = modules.map((m) => `#define HAL_${m}_MODULE_ENABLED`).join('\n');
  const includes = INCLUDE_ORDER.filter((m) => modules.includes(m))
    .map((m) => `#ifdef HAL_${m}_MODULE_ENABLED\n  #include "${prefix}_hal_${m.toLowerCase()}.h"\n#endif`)
    .join('\n');
  const callbacks = modules
    .filter((m) => ['ADC', 'DAC', 'I2C', 'SPI', 'TIM', 'UART'].includes(m))
    .map((m) => `#define USE_HAL_${m}_REGISTER_CALLBACKS 0U`)
    .join('\n');
  const f4Only = family === 'STM32F4'
    ? `#define INSTRUCTION_CACHE_ENABLE 1U
#define DATA_CACHE_ENABLE 1U
#define EXTERNAL_CLOCK_VALUE 12288000U
`
    : '';
  const clocks = family === 'STM32F4'
    ? `#if !defined(HSE_VALUE)
  #define HSE_VALUE 8000000U /* STM32F4-Discovery crystal; unused: HIL runs from HSI */
#endif
#if !defined(HSI_VALUE)
  #define HSI_VALUE 16000000U
#endif`
    : `#if !defined(HSE_VALUE)
  #define HSE_VALUE 8000000U /* Blue Pill crystal; unused: HIL runs from HSI */
#endif
#if !defined(HSI_VALUE)
  #define HSI_VALUE 8000000U
#endif`;

  const content = `/* ADIA HIL - AUTO GENERATED STM32Cube HAL configuration (${family}) */
/* Only the HAL modules used by the generated firmware are enabled.    */
#ifndef ${guard}
#define ${guard}

#ifdef __cplusplus
extern "C" {
#endif

#define HAL_MODULE_ENABLED
${enabled}

${clocks}
#if !defined(HSE_STARTUP_TIMEOUT)
  #define HSE_STARTUP_TIMEOUT 100U
#endif
#if !defined(LSI_VALUE)
  #define LSI_VALUE ${family === 'STM32F4' ? '32000U' : '40000U'}
#endif
#if !defined(LSE_VALUE)
  #define LSE_VALUE 32768U
#endif
#if !defined(LSE_STARTUP_TIMEOUT)
  #define LSE_STARTUP_TIMEOUT 5000U
#endif

#define VDD_VALUE 3300U
#define TICK_INT_PRIORITY 0x0FU
#define USE_RTOS 0U
#define PREFETCH_ENABLE 1U
${f4Only}${callbacks}

${includes}

#define assert_param(expr) ((void)0U)

#ifdef __cplusplus
}
#endif

#endif /* ${guard} */
`;
  return { name: `${prefix}_hal_conf.h`, content };
}
