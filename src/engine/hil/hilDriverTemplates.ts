import { TargetMCU, PeripheralType } from './hilTypes';

const formatArduinoPinExpr = (pin: string) => {
  const trimmed = (pin || '0').trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  if (/^A\d+$/i.test(trimmed)) return trimmed.toUpperCase();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const unquoted = trimmed.slice(1, -1).trim();
    if (/^\d+$/.test(unquoted)) return unquoted;
    if (/^A\d+$/i.test(unquoted)) return unquoted.toUpperCase();
  }
  return `parseArduinoPin(${trimmed})`;
};

export interface DriverSnippet {
  includes: string;
  globals: string;
  init: string;
  read: string;
  write: string;
}

export interface MCUTemplate {
  name: string;
  systemIncludes: string;
  globals: string;
  systemInit: string;
  serialInit: (baudRate: number) => string;
  serialReceive: string;
  serialTransmit: string;
  tickDelay: string;
  peripherals: Record<PeripheralType, {
    init: (pin: string, channelName: string, direction: 'In' | 'Out') => string;
    read: (pin: string, channelName: string) => string;
    write: (pin: string, channelName: string, valExpr: string) => string;
  }>;
}

function getSTM32F4UARTConfig(pin: string) {
  const p = pin.toUpperCase();
  if (p.includes('A9') || p.includes('A10')) {
    return {
      instance: 'USART1',
      port: 'A',
      txPin: '9',
      rxPin: '10',
      af: 'GPIO_AF7_USART1',
      rccUart: '__HAL_RCC_USART1_CLK_ENABLE',
      uartHandle: 'huart1'
    };
  }
  if (p.includes('A2') || p.includes('A3')) {
    return {
      instance: 'USART2',
      port: 'A',
      txPin: '2',
      rxPin: '3',
      af: 'GPIO_AF7_USART2',
      rccUart: '__HAL_RCC_USART2_CLK_ENABLE',
      uartHandle: 'huart2'
    };
  }
  if (p.includes('C10') || p.includes('C11') || p.includes('PC10') || p.includes('PC11')) {
    return {
      instance: 'USART3',
      port: 'C',
      txPin: '10',
      rxPin: '11',
      af: 'GPIO_AF7_USART3',
      rccUart: '__HAL_RCC_USART3_CLK_ENABLE',
      uartHandle: 'huart3'
    };
  }
  if (p.includes('B10') || p.includes('B11')) {
    return {
      instance: 'USART3',
      port: 'B',
      txPin: '10',
      rxPin: '11',
      af: 'GPIO_AF7_USART3',
      rccUart: '__HAL_RCC_USART3_CLK_ENABLE',
      uartHandle: 'huart3'
    };
  }
  return {
    instance: 'USART3',
    port: 'C',
    txPin: '10',
    rxPin: '11',
    af: 'GPIO_AF7_USART3',
    rccUart: '__HAL_RCC_USART3_CLK_ENABLE',
    uartHandle: 'huart3'
  };
}

function getSTM32F1UARTConfig(pin: string) {
  const p = pin.toUpperCase();
  if (p.includes('A9') || p.includes('A10')) {
    return {
      instance: 'USART1',
      port: 'A',
      txPin: '9',
      rxPin: '10',
      rccUart: '__HAL_RCC_USART1_CLK_ENABLE',
      uartHandle: 'huart1'
    };
  }
  if (p.includes('A2') || p.includes('A3')) {
    return {
      instance: 'USART2',
      port: 'A',
      txPin: '2',
      rxPin: '3',
      rccUart: '__HAL_RCC_USART2_CLK_ENABLE',
      uartHandle: 'huart2'
    };
  }
  return {
    instance: 'USART2',
    port: 'A',
    txPin: '2',
    rxPin: '3',
    rccUart: '__HAL_RCC_USART2_CLK_ENABLE',
    uartHandle: 'huart2'
  };
}

export const hilDriverTemplates: Record<TargetMCU, MCUTemplate> = {
  STM32F4: {
    name: 'STM32F4xx HAL',
    systemIncludes: `#include "stm32f4xx_hal.h"\n#include <string.h>`,
    globals: `
UART_HandleTypeDef huart1;
UART_HandleTypeDef huart2;
UART_HandleTypeDef huart3;
SPI_HandleTypeDef hspi1;
ADC_HandleTypeDef hadc1;
DAC_HandleTypeDef hdac;
TIM_HandleTypeDef htim1;
I2C_HandleTypeDef hi2c1;

/* HIL Communication Buffers */
#define RX_BUF_SIZE 128
uint8_t rx_buffer[RX_BUF_SIZE];
uint8_t rx_index = 0;

static inline uint32_t GetADCChannel(const char* pin) {
    if (strcmp(pin, "PA0") == 0 || strcmp(pin, "pa0") == 0) return ADC_CHANNEL_0;
    if (strcmp(pin, "PA1") == 0 || strcmp(pin, "pa1") == 0) return ADC_CHANNEL_1;
    if (strcmp(pin, "PA2") == 0 || strcmp(pin, "pa2") == 0) return ADC_CHANNEL_2;
    if (strcmp(pin, "PA3") == 0 || strcmp(pin, "pa3") == 0) return ADC_CHANNEL_3;
    if (strcmp(pin, "PA4") == 0 || strcmp(pin, "pa4") == 0) return ADC_CHANNEL_4;
    if (strcmp(pin, "PA5") == 0 || strcmp(pin, "pa5") == 0) return ADC_CHANNEL_5;
    if (strcmp(pin, "PA6") == 0 || strcmp(pin, "pa6") == 0) return ADC_CHANNEL_6;
    if (strcmp(pin, "PA7") == 0 || strcmp(pin, "pa7") == 0) return ADC_CHANNEL_7;
    if (strcmp(pin, "PB0") == 0 || strcmp(pin, "pb0") == 0) return ADC_CHANNEL_8;
    if (strcmp(pin, "PB1") == 0 || strcmp(pin, "pb1") == 0) return ADC_CHANNEL_9;
    if (strcmp(pin, "PC0") == 0 || strcmp(pin, "pc0") == 0) return ADC_CHANNEL_10;
    if (strcmp(pin, "PC1") == 0 || strcmp(pin, "pc1") == 0) return ADC_CHANNEL_11;
    if (strcmp(pin, "PC2") == 0 || strcmp(pin, "pc2") == 0) return ADC_CHANNEL_12;
    if (strcmp(pin, "PC3") == 0 || strcmp(pin, "pc3") == 0) return ADC_CHANNEL_13;
    if (strcmp(pin, "PC4") == 0 || strcmp(pin, "pc4") == 0) return ADC_CHANNEL_14;
    if (strcmp(pin, "PC5") == 0 || strcmp(pin, "pc5") == 0) return ADC_CHANNEL_15;
    return ADC_CHANNEL_0;
}

static inline uint32_t GetDACChannel(const char* pin) {
    if (strcmp(pin, "PA5") == 0 || strcmp(pin, "pa5") == 0) return DAC_CHANNEL_2;
    return DAC_CHANNEL_1;
}

static inline uint32_t GetPWMChannel(const char* pin) {
    if (strcmp(pin, "PA9") == 0 || strcmp(pin, "pa9") == 0 || strcmp(pin, "PE11") == 0 || strcmp(pin, "pe11") == 0) return TIM_CHANNEL_2;
    if (strcmp(pin, "PA10") == 0 || strcmp(pin, "pa10") == 0 || strcmp(pin, "PE13") == 0 || strcmp(pin, "pe13") == 0) return TIM_CHANNEL_3;
    if (strcmp(pin, "PA11") == 0 || strcmp(pin, "pa11") == 0 || strcmp(pin, "PE14") == 0 || strcmp(pin, "pe14") == 0) return TIM_CHANNEL_4;
    return TIM_CHANNEL_1;
}

static inline uint32_t HAL_ADC_ReadChannel(uint32_t channel) {
    ADC_ChannelConfTypeDef sConfig = {0};
    sConfig.Channel = channel;
    sConfig.Rank = 1;
    sConfig.SamplingTime = ADC_SAMPLETIME_15CYCLES;
    HAL_ADC_ConfigChannel(&hadc1, &sConfig);

    uint32_t val = 0U;
    HAL_ADC_Start(&hadc1);
    if (HAL_ADC_PollForConversion(&hadc1, 10U) == HAL_OK) {
        val = HAL_ADC_GetValue(&hadc1);
    }
    (void)HAL_ADC_Stop(&hadc1);
    return val;
}

static inline uint32_t HAL_UART_ReadChannel(UART_HandleTypeDef* huart) {
    uint8_t ch = 0U;
    (void)HAL_UART_Receive(huart, &ch, 1, 10);
    return ch;
}

static inline void HAL_UART_WriteChannel(UART_HandleTypeDef* huart, uint32_t val) {
    uint8_t ch = (uint8_t)val;
    (void)HAL_UART_Transmit(huart, &ch, 1, 10);
}

static inline uint32_t HAL_SPI_ReadChannel(GPIO_TypeDef* csPort, uint16_t csPin) {
    uint8_t rx = 0U;
    HAL_GPIO_WritePin(csPort, csPin, GPIO_PIN_RESET);
    (void)HAL_SPI_Receive(&hspi1, &rx, 1, 10);
    HAL_GPIO_WritePin(csPort, csPin, GPIO_PIN_SET);
    return rx;
}

static inline void HAL_SPI_WriteChannel(GPIO_TypeDef* csPort, uint16_t csPin, uint32_t val) {
    uint8_t tx = (uint8_t)val;
    HAL_GPIO_WritePin(csPort, csPin, GPIO_PIN_RESET);
    (void)HAL_SPI_Transmit(&hspi1, &tx, 1, 10);
    HAL_GPIO_WritePin(csPort, csPin, GPIO_PIN_SET);
}
`,
    systemInit: `
  HAL_Init();
  /* Configure System Clock here if needed */
`,
    serialInit: (baudRate) => `
  /* USART2 GPIO Configuration */
  __HAL_RCC_USART2_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  GPIO_InitStruct.Pin = GPIO_PIN_2|GPIO_PIN_3;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF7_USART2;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /* USART2 Init */
  huart2.Instance = USART2;
  huart2.Init.BaudRate = HIL_BAUDRATE;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  HAL_UART_Init(&huart2);
`,
    serialReceive: `
  /* Read available bytes from UART2 */
  uint8_t byte;
  while (HAL_UART_Receive(&huart2, &byte, 1, 1) == HAL_OK) {
      if (rx_index < RX_BUF_SIZE - 1) {
          rx_buffer[rx_index++] = byte;
          if (byte == '\\n') {
              rx_buffer[rx_index] = '\\0';
              HIL_ProcessMessage((char*)rx_buffer);
              rx_index = 0;
          }
      } else {
          rx_index = 0; // Buffer overflow protection
      }
  }
`,
    serialTransmit: `
void HIL_SendString(const char* str) {
    HAL_UART_Transmit(&huart2, (uint8_t*)str, strlen(str), 100);
}
`,
    tickDelay: `HAL_Delay(10); /* 10ms default task cycle */`,
    peripherals: {
      GPIO: {
        init: (pin, name, dir) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* Init GPIO ${name} on P${port}${pinNum} */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_${name}.Mode = ${dir === 'In' ? 'GPIO_MODE_INPUT' : 'GPIO_MODE_OUTPUT_PP'};
  GPIO_InitStruct_${name}.Pull = GPIO_NOPULL;
  GPIO_InitStruct_${name}.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_${name});`;
        },
        read: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `HAL_GPIO_ReadPin(GPIO${port}, GPIO_PIN_${pinNum}) == GPIO_PIN_SET`;
        },
        write: (pin, name, valExpr) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `HAL_GPIO_WritePin(GPIO${port}, GPIO_PIN_${pinNum}, (${valExpr}) ? GPIO_PIN_SET : GPIO_PIN_RESET);`;
        }
      },
      ADC: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* GPIO Configuration for ADC1 Channel on Pin ${pin} */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_ANALOG;
  GPIO_InitStruct_${name}.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_${name});

  /* ADC1 Init for ${name} (Pin ${pin}) */
  __HAL_RCC_ADC1_CLK_ENABLE();
  hadc1.Instance = ADC1;
  hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4;
  hadc1.Init.Resolution = ADC_RESOLUTION_12B;
  hadc1.Init.ScanConvMode = DISABLE;
  hadc1.Init.ContinuousConvMode = DISABLE;
  hadc1.Init.DiscontinuousConvMode = DISABLE;
  hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;
  hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;
  hadc1.Init.NbrOfConversion = 1;
  HAL_ADC_Init(&hadc1);`;
        },
        read: (pin, name) => {
          return `HAL_ADC_ReadChannel(GetADCChannel("${pin}"))`;
        },
        write: () => `/* ADC is Read-Only */`
      },
      DAC: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* GPIO Configuration for DAC Channel on Pin ${pin} */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_ANALOG;
  GPIO_InitStruct_${name}.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_${name});

  /* DAC Init for ${name} (Pin ${pin}) */
  __HAL_RCC_DAC_CLK_ENABLE();
  hdac.Instance = DAC;
  HAL_DAC_Init(&hdac);
  DAC_ChannelConfTypeDef sConfig_${name} = {0};
  sConfig_${name}.DAC_Trigger = DAC_TRIGGER_NONE;
  sConfig_${name}.DAC_OutputBuffer = DAC_OUTPUTBUFFER_ENABLE;
  HAL_DAC_ConfigChannel(&hdac, &sConfig_${name}, GetDACChannel("${pin}"));
  HAL_DAC_Start(&hdac, GetDACChannel("${pin}"));`;
        },
        read: () => `0.0f /* DAC is Write-Only */`,
        write: (pin, name, valExpr) => {
          return `HAL_DAC_SetValue(&hdac, GetDACChannel("${pin}"), DAC_ALIGN_12B_R, (uint32_t)(${valExpr}));`;
        }
      },
      PWM: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* GPIO Configuration for PWM Channel on Pin ${pin} */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct_${name}.Pull = GPIO_NOPULL;
  GPIO_InitStruct_${name}.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct_${name}.Alternate = GPIO_AF1_TIM1;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_${name});

  /* TIM1 PWM Init for ${name} (Pin ${pin}) */
  __HAL_RCC_TIM1_CLK_ENABLE();
  htim1.Instance = TIM1;
  htim1.Init.Prescaler = SYSTEM_CLOCK_MHZ - 1;
  htim1.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim1.Init.Period = 1000 - 1;
  htim1.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  HAL_TIM_PWM_Init(&htim1);
  TIM_OC_InitTypeDef sConfigOC_${name} = {0};
  sConfigOC_${name}.OCMode = TIM_OCMODE_PWM1;
  sConfigOC_${name}.Pulse = 0;
  sConfigOC_${name}.OCPolarity = TIM_OCPOLARITY_HIGH;
  sConfigOC_${name}.OCFastMode = TIM_OCFAST_DISABLE;
  HAL_TIM_PWM_ConfigChannel(&htim1, &sConfigOC_${name}, GetPWMChannel("${pin}"));
  HAL_TIM_PWM_Start(&htim1, GetPWMChannel("${pin}"));`;
        },
        read: () => `0.0f /* PWM is Write-Only */`,
        write: (pin, name, valExpr) => {
          return `__HAL_TIM_SET_COMPARE(&htim1, GetPWMChannel("${pin}"), (uint32_t)(${valExpr}));`;
        }
      },
      UART: {
        init: (pin, name, dir) => {
          const cfg = getSTM32F4UARTConfig(pin);
          return `
  /* ${cfg.instance} Init for ${name} on Pin ${pin} */
  ${cfg.rccUart}();
  __HAL_RCC_GPIO${cfg.port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${cfg.txPin}|GPIO_PIN_${cfg.rxPin};
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct_${name}.Pull = GPIO_PULLUP;
  GPIO_InitStruct_${name}.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct_${name}.Alternate = ${cfg.af};
  HAL_GPIO_Init(GPIO${cfg.port}, &GPIO_InitStruct_${name});
  ${cfg.uartHandle}.Instance = ${cfg.instance};
  ${cfg.uartHandle}.Init.BaudRate = 115200;
  ${cfg.uartHandle}.Init.WordLength = UART_WORDLENGTH_8B;
  ${cfg.uartHandle}.Init.StopBits = UART_STOPBITS_1;
  ${cfg.uartHandle}.Init.Parity = UART_PARITY_NONE;
  ${cfg.uartHandle}.Init.Mode = ${dir === 'In' ? 'UART_MODE_RX' : 'UART_MODE_TX'};
  ${cfg.uartHandle}.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  ${cfg.uartHandle}.Init.OverSampling = UART_OVERSAMPLING_16;
  HAL_UART_Init(&${cfg.uartHandle});`;
        },
        read: (pin) => {
          const cfg = getSTM32F4UARTConfig(pin);
          return `HAL_UART_ReadChannel(&${cfg.uartHandle})`;
        },
        write: (pin, name, valExpr) => {
          const cfg = getSTM32F4UARTConfig(pin);
          return `HAL_UART_WriteChannel(&${cfg.uartHandle}, ${valExpr});`;
        }
      },
      SPI: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* SPI1 Init for ${name} on CS Pin ${pin} */
  __HAL_RCC_SPI1_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_5|GPIO_PIN_6|GPIO_PIN_7;
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct_${name}.Pull = GPIO_NOPULL;
  GPIO_InitStruct_${name}.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct_${name}.Alternate = GPIO_AF5_SPI1;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct_${name});

  /* CS Pin Configuration */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_CS_${name} = {0};
  GPIO_InitStruct_CS_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_CS_${name}.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct_CS_${name}.Pull = GPIO_PULLUP;
  GPIO_InitStruct_CS_${name}.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_CS_${name});
  HAL_GPIO_WritePin(GPIO${port}, GPIO_PIN_${pinNum}, GPIO_PIN_SET);

  hspi1.Instance = SPI1;
  hspi1.Init.Mode = SPI_MODE_MASTER;
  hspi1.Init.Direction = SPI_DIRECTION_2LINES;
  hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
  hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
  hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
  hspi1.Init.NSS = SPI_NSS_SOFT;
  hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_16;
  HAL_SPI_Init(&hspi1);`;
        },
        read: (pin) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `HAL_SPI_ReadChannel(GPIO${port}, GPIO_PIN_${pinNum})`;
        },
        write: (pin, name, valExpr) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `HAL_SPI_WriteChannel(GPIO${port}, GPIO_PIN_${pinNum}, ${valExpr});`;
        }
      },
      I2C: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : 'B';
          const pinNum = hasP ? pin.substring(2) : '6';
          const sdaPinNum = (parseInt(pinNum, 10) + 1).toString();
          return `  /* I2C1 GPIO Configuration: SCL on P${port}${pinNum}, SDA on P${port}${sdaPinNum} */\n` +
                 `  __HAL_RCC_GPIO${port}_CLK_ENABLE();\n` +
                 `  GPIO_InitTypeDef GPIO_InitStruct_I2C_${name} = {0};\n` +
                 `  GPIO_InitStruct_I2C_${name}.Pin = GPIO_PIN_${pinNum}|GPIO_PIN_${sdaPinNum};\n` +
                 `  GPIO_InitStruct_I2C_${name}.Mode = GPIO_MODE_AF_OD;\n` +
                 `  GPIO_InitStruct_I2C_${name}.Pull = GPIO_PULLUP;\n` +
                 `  GPIO_InitStruct_I2C_${name}.Speed = GPIO_SPEED_FREQ_VERY_HIGH;\n` +
                 `  GPIO_InitStruct_I2C_${name}.Alternate = GPIO_AF4_I2C1;\n` +
                 `  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_I2C_${name});\n\n` +
                 `  __HAL_RCC_I2C1_CLK_ENABLE();\n` +
                 `  hi2c1.Instance = I2C1;\n` +
                 `  hi2c1.Init.ClockSpeed = 100000;\n` +
                 `  hi2c1.Init.OwnAddress1 = 0;\n` +
                 `  HAL_I2C_Init(&hi2c1);`;
        },
        read: () => `({ uint8_t rx_data = 0U; (void)HAL_I2C_Master_Receive(&hi2c1, 0x50U << 1, &rx_data, 1, 10); rx_data; })`,
        write: (pin, name, valExpr) => `do { uint8_t tx_data = (uint8_t)(${valExpr}); (void)HAL_I2C_Master_Transmit(&hi2c1, 0x50U << 1, &tx_data, 1, 10); } while(0);`
      },
      CAN: {
        init: () => `/* CAN init code */`,
        read: () => `0`,
        write: () => `/* CAN write */`
      },
      Timer: {
        init: () => `/* Timer init code */`,
        read: () => `HAL_GetTick()`,
        write: () => `/* Timer is read-only */`
      }
    }
  },
  STM32F1: {
    name: 'STM32F1xx HAL',
    systemIncludes: `#include "stm32f1xx_hal.h"\n#include <string.h>`,
    globals: `
UART_HandleTypeDef huart1;
UART_HandleTypeDef huart2;
SPI_HandleTypeDef hspi1;
ADC_HandleTypeDef hadc1;
TIM_HandleTypeDef htim1;
I2C_HandleTypeDef hi2c1;

#define RX_BUF_SIZE 128
uint8_t rx_buffer[RX_BUF_SIZE];
uint8_t rx_index = 0;

static inline uint32_t GetADCChannel(const char* pin) {
    if (strcmp(pin, "PA0") == 0 || strcmp(pin, "pa0") == 0) return ADC_CHANNEL_0;
    if (strcmp(pin, "PA1") == 0 || strcmp(pin, "pa1") == 0) return ADC_CHANNEL_1;
    if (strcmp(pin, "PA2") == 0 || strcmp(pin, "pa2") == 0) return ADC_CHANNEL_2;
    if (strcmp(pin, "PA3") == 0 || strcmp(pin, "pa3") == 0) return ADC_CHANNEL_3;
    if (strcmp(pin, "PA4") == 0 || strcmp(pin, "pa4") == 0) return ADC_CHANNEL_4;
    if (strcmp(pin, "PA5") == 0 || strcmp(pin, "pa5") == 0) return ADC_CHANNEL_5;
    if (strcmp(pin, "PA6") == 0 || strcmp(pin, "pa6") == 0) return ADC_CHANNEL_6;
    if (strcmp(pin, "PA7") == 0 || strcmp(pin, "pa7") == 0) return ADC_CHANNEL_7;
    if (strcmp(pin, "PB0") == 0 || strcmp(pin, "pb0") == 0) return ADC_CHANNEL_8;
    if (strcmp(pin, "PB1") == 0 || strcmp(pin, "pb1") == 0) return ADC_CHANNEL_9;
    if (strcmp(pin, "PC0") == 0 || strcmp(pin, "pc0") == 0) return ADC_CHANNEL_10;
    if (strcmp(pin, "PC1") == 0 || strcmp(pin, "pc1") == 0) return ADC_CHANNEL_11;
    if (strcmp(pin, "PC2") == 0 || strcmp(pin, "pc2") == 0) return ADC_CHANNEL_12;
    if (strcmp(pin, "PC3") == 0 || strcmp(pin, "pc3") == 0) return ADC_CHANNEL_13;
    if (strcmp(pin, "PC4") == 0 || strcmp(pin, "pc4") == 0) return ADC_CHANNEL_14;
    if (strcmp(pin, "PC5") == 0 || strcmp(pin, "pc5") == 0) return ADC_CHANNEL_15;
    return ADC_CHANNEL_0;
}

static inline uint32_t GetPWMChannel(const char* pin) {
    if (strcmp(pin, "PA9") == 0 || strcmp(pin, "pa9") == 0 || strcmp(pin, "PE11") == 0 || strcmp(pin, "pe11") == 0) return TIM_CHANNEL_2;
    if (strcmp(pin, "PA10") == 0 || strcmp(pin, "pa10") == 0 || strcmp(pin, "PE13") == 0 || strcmp(pin, "pe13") == 0) return TIM_CHANNEL_3;
    if (strcmp(pin, "PA11") == 0 || strcmp(pin, "pa11") == 0 || strcmp(pin, "PE14") == 0 || strcmp(pin, "pe14") == 0) return TIM_CHANNEL_4;
    return TIM_CHANNEL_1;
}

static inline uint32_t HAL_ADC_ReadChannel(uint32_t channel) {
    ADC_ChannelConfTypeDef sConfig = {0};
    sConfig.Channel = channel;
    sConfig.Rank = 1;
    sConfig.SamplingTime = ADC_SAMPLETIME_15CYCLES;
    HAL_ADC_ConfigChannel(&hadc1, &sConfig);

    uint32_t val = 0U;
    HAL_ADC_Start(&hadc1);
    if (HAL_ADC_PollForConversion(&hadc1, 10U) == HAL_OK) {
        val = HAL_ADC_GetValue(&hadc1);
    }
    (void)HAL_ADC_Stop(&hadc1);
    return val;
}

static inline uint32_t HAL_UART_ReadChannel(UART_HandleTypeDef* huart) {
    uint8_t ch = 0U;
    (void)HAL_UART_Receive(huart, &ch, 1, 10);
    return ch;
}

static inline void HAL_UART_WriteChannel(UART_HandleTypeDef* huart, uint32_t val) {
    uint8_t ch = (uint8_t)val;
    (void)HAL_UART_Transmit(huart, &ch, 1, 10);
}

static inline uint32_t HAL_SPI_ReadChannel(GPIO_TypeDef* csPort, uint16_t csPin) {
    uint8_t rx = 0U;
    HAL_GPIO_WritePin(csPort, csPin, GPIO_PIN_RESET);
    (void)HAL_SPI_Receive(&hspi1, &rx, 1, 10);
    HAL_GPIO_WritePin(csPort, csPin, GPIO_PIN_SET);
    return rx;
}

static inline void HAL_SPI_WriteChannel(GPIO_TypeDef* csPort, uint16_t csPin, uint32_t val) {
    uint8_t tx = (uint8_t)val;
    HAL_GPIO_WritePin(csPort, csPin, GPIO_PIN_RESET);
    (void)HAL_SPI_Transmit(&hspi1, &tx, 1, 10);
    HAL_GPIO_WritePin(csPort, csPin, GPIO_PIN_SET);
}
`,
    systemInit: `
  HAL_Init();
`,
    serialInit: (baudRate) => `
  __HAL_RCC_USART1_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  GPIO_InitStruct.Pin = GPIO_PIN_9;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_HIGH;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  GPIO_InitStruct.Pin = GPIO_PIN_10;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  huart1.Instance = USART1;
  huart1.Init.BaudRate = HIL_BAUDRATE;
  huart1.Init.WordLength = UART_WORDLENGTH_8B;
  huart1.Init.StopBits = UART_STOPBITS_1;
  huart1.Init.Parity = UART_PARITY_NONE;
  huart1.Init.Mode = UART_MODE_TX_RX;
  huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart1.Init.OverSampling = UART_OVERSAMPLING_16;
  HAL_UART_Init(&huart1);
`,
    serialReceive: `
  uint8_t byte;
  while (HAL_UART_Receive(&huart1, &byte, 1, 1) == HAL_OK) {
      if (rx_index < RX_BUF_SIZE - 1) {
          rx_buffer[rx_index++] = byte;
          if (byte == '\\n') {
              rx_buffer[rx_index] = '\\0';
              HIL_ProcessMessage((char*)rx_buffer);
              rx_index = 0;
          }
      } else {
          rx_index = 0;
      }
  }
`,
    serialTransmit: `
void HIL_SendString(const char* str) {
    HAL_UART_Transmit(&huart1, (uint8_t*)str, strlen(str), 100);
}
`,
    tickDelay: `HAL_Delay(10);`,
    peripherals: {
      GPIO: {
        init: (pin, name, dir) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* Init GPIO ${name} on P${port}${pinNum} */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_${name}.Mode = ${dir === 'In' ? 'GPIO_MODE_INPUT' : 'GPIO_MODE_OUTPUT_PP'};
  GPIO_InitStruct_${name}.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_${name});`;
        },
        read: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `HAL_GPIO_ReadPin(GPIO${port}, GPIO_PIN_${pinNum}) == GPIO_PIN_SET`;
        },
        write: (pin, name, valExpr) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `HAL_GPIO_WritePin(GPIO${port}, GPIO_PIN_${pinNum}, (${valExpr}) ? GPIO_PIN_SET : GPIO_PIN_RESET);`;
        }
      },
      ADC: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* GPIO Configuration for ADC1 Channel on Pin ${pin} */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_ANALOG;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_${name});

  /* ADC1 Init for ${name} (Pin ${pin}) */
  __HAL_RCC_ADC1_CLK_ENABLE();
  hadc1.Instance = ADC1;
  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;
  hadc1.Init.ScanConvMode = DISABLE;
  hadc1.Init.ContinuousConvMode = DISABLE;
  hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
  hadc1.Init.NbrOfConversion = 1;
  HAL_ADC_Init(&hadc1);`;
        },
        read: (pin, name) => {
          return `HAL_ADC_ReadChannel(GetADCChannel("${pin}"))`;
        },
        write: () => `/* ADC is Read-Only */`
      },
      DAC: {
        init: () => ``,
        read: () => `0`,
        write: () => `/* DAC write */`
      },
      PWM: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* GPIO Configuration for PWM Channel on Pin ${pin} */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct_${name}.Speed = GPIO_SPEED_FREQ_HIGH;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_${name});

  /* TIM1 PWM Init for ${name} (Pin ${pin}) */
  __HAL_RCC_TIM1_CLK_ENABLE();
  htim1.Instance = TIM1;
  htim1.Init.Prescaler = SYSTEM_CLOCK_MHZ - 1;
  htim1.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim1.Init.Period = 1000 - 1;
  htim1.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  HAL_TIM_PWM_Init(&htim1);
  TIM_OC_InitTypeDef sConfigOC_${name} = {0};
  sConfigOC_${name}.OCMode = TIM_OCMODE_PWM1;
  sConfigOC_${name}.Pulse = 0;
  sConfigOC_${name}.OCPolarity = TIM_OCPOLARITY_HIGH;
  sConfigOC_${name}.OCFastMode = TIM_OCFAST_DISABLE;
  HAL_TIM_PWM_ConfigChannel(&htim1, &sConfigOC_${name}, GetPWMChannel("${pin}"));
  HAL_TIM_PWM_Start(&htim1, GetPWMChannel("${pin}"));`;
        },
        read: () => `0.0f /* PWM is Write-Only */`,
        write: (pin, name, valExpr) => {
          return `__HAL_TIM_SET_COMPARE(&htim1, GetPWMChannel("${pin}"), (uint32_t)(${valExpr}));`;
        }
      },
      UART: {
        init: (pin, name, dir) => {
          const cfg = getSTM32F1UARTConfig(pin);
          return `
  /* ${cfg.instance} Init for ${name} on Pin ${pin} */
  ${cfg.rccUart}();
  __HAL_RCC_GPIO${cfg.port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${cfg.txPin};
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct_${name}.Speed = GPIO_SPEED_FREQ_HIGH;
  HAL_GPIO_Init(GPIO${cfg.port}, &GPIO_InitStruct_${name});
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_${cfg.rxPin};
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct_${name}.Pull = GPIO_PULLUP;
  HAL_GPIO_Init(GPIO${cfg.port}, &GPIO_InitStruct_${name});
  ${cfg.uartHandle}.Instance = ${cfg.instance};
  ${cfg.uartHandle}.Init.BaudRate = 115200;
  ${cfg.uartHandle}.Init.WordLength = UART_WORDLENGTH_8B;
  ${cfg.uartHandle}.Init.StopBits = UART_STOPBITS_1;
  ${cfg.uartHandle}.Init.Parity = UART_PARITY_NONE;
  ${cfg.uartHandle}.Init.Mode = ${dir === 'In' ? 'UART_MODE_RX' : 'UART_MODE_TX'};
  ${cfg.uartHandle}.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  ${cfg.uartHandle}.Init.OverSampling = UART_OVERSAMPLING_16;
  HAL_UART_Init(&${cfg.uartHandle});`;
        },
        read: (pin) => {
          const cfg = getSTM32F1UARTConfig(pin);
          return `HAL_UART_ReadChannel(&${cfg.uartHandle})`;
        },
        write: (pin, name, valExpr) => {
          const cfg = getSTM32F1UARTConfig(pin);
          return `HAL_UART_WriteChannel(&${cfg.uartHandle}, ${valExpr});`;
        }
      },
      SPI: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `
  /* SPI1 Init for ${name} on CS Pin ${pin} */
  __HAL_RCC_SPI1_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_${name} = {0};
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_5|GPIO_PIN_7;
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct_${name}.Speed = GPIO_SPEED_FREQ_HIGH;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct_${name});
  GPIO_InitStruct_${name}.Pin = GPIO_PIN_6;
  GPIO_InitStruct_${name}.Mode = GPIO_MODE_INPUT;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct_${name});

  /* CS Pin Configuration */
  __HAL_RCC_GPIO${port}_CLK_ENABLE();
  GPIO_InitTypeDef GPIO_InitStruct_CS_${name} = {0};
  GPIO_InitStruct_CS_${name}.Pin = GPIO_PIN_${pinNum};
  GPIO_InitStruct_CS_${name}.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct_CS_${name}.Speed = GPIO_SPEED_FREQ_HIGH;
  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_CS_${name});
  HAL_GPIO_WritePin(GPIO${port}, GPIO_PIN_${pinNum}, GPIO_PIN_SET);

  hspi1.Instance = SPI1;
  hspi1.Init.Mode = SPI_MODE_MASTER;
  hspi1.Init.Direction = SPI_DIRECTION_2LINES;
  hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
  hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
  hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
  hspi1.Init.NSS = SPI_NSS_SOFT;
  hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_16;
  HAL_SPI_Init(&hspi1);`;
        },
        read: (pin) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `HAL_SPI_ReadChannel(GPIO${port}, GPIO_PIN_${pinNum})`;
        },
        write: (pin, name, valExpr) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : pin.charAt(0).toUpperCase();
          const pinNum = hasP ? pin.substring(2) : pin.substring(1);
          return `HAL_SPI_WriteChannel(GPIO${port}, GPIO_PIN_${pinNum}, ${valExpr});`;
        }
      },
      I2C: {
        init: (pin, name) => {
          const hasP = pin.startsWith('P') || pin.startsWith('p');
          const port = hasP ? pin.charAt(1).toUpperCase() : 'B';
          const pinNum = hasP ? pin.substring(2) : '6';
          const sdaPinNum = (parseInt(pinNum, 10) + 1).toString();
          return `  /* I2C1 GPIO Configuration: SCL on P${port}${pinNum}, SDA on P${port}${sdaPinNum} */\n` +
                 `  __HAL_RCC_GPIO${port}_CLK_ENABLE();\n` +
                 `  GPIO_InitTypeDef GPIO_InitStruct_I2C_${name} = {0};\n` +
                 `  GPIO_InitStruct_I2C_${name}.Pin = GPIO_PIN_${pinNum}|GPIO_PIN_${sdaPinNum};\n` +
                 `  GPIO_InitStruct_I2C_${name}.Mode = GPIO_MODE_AF_OD;\n` +
                 `  GPIO_InitStruct_I2C_${name}.Pull = GPIO_PULLUP;\n` +
                 `  GPIO_InitStruct_I2C_${name}.Speed = GPIO_SPEED_FREQ_VERY_HIGH;\n` +
                 `  HAL_GPIO_Init(GPIO${port}, &GPIO_InitStruct_I2C_${name});\n\n` +
                 `  __HAL_RCC_I2C1_CLK_ENABLE();\n` +
                 `  hi2c1.Instance = I2C1;\n` +
                 `  hi2c1.Init.ClockSpeed = 100000;\n` +
                 `  hi2c1.Init.OwnAddress1 = 0;\n` +
                 `  HAL_I2C_Init(&hi2c1);`;
        },
        read: () => `({ uint8_t rx_data = 0U; (void)HAL_I2C_Master_Receive(&hi2c1, 0x50U << 1, &rx_data, 1, 10); rx_data; })`,
        write: (pin, name, valExpr) => `do { uint8_t tx_data = (uint8_t)(${valExpr}); (void)HAL_I2C_Master_Transmit(&hi2c1, 0x50U << 1, &tx_data, 1, 10); } while(0);`
      },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `HAL_GetTick()`, write: () => `` }
    }
  },
  Arduino_Uno: {
    name: 'Arduino Uno',
    systemIncludes: `#include "Arduino.h"\n#include <Wire.h>`,
    globals: `
/* HIL Buffer */
#define RX_BUF_SIZE 128
char rx_buffer[RX_BUF_SIZE];
uint8_t rx_index = 0;

#include <SoftwareSerial.h>
SoftwareSerial softSerial(10, 11);
#include <SPI.h>

#ifdef __cplusplus
static inline int parseArduinoPin(const char* pinStr) {
    if (!pinStr || !*pinStr) return 0;
    if (pinStr[0] == 'A' || pinStr[0] == 'a') {
#if defined(A0)
        return A0 + atoi(pinStr + 1);
#else
        return 14 + atoi(pinStr + 1);
#endif
    }
    return atoi(pinStr);
}
static inline uint32_t HAL_UART_ReadChannel(void) {
    return softSerial.available() ? (uint32_t)softSerial.read() : 0U;
}
static inline void HAL_UART_WriteChannel(uint32_t val) {
    softSerial.write((uint8_t)val);
}
static inline uint32_t HAL_SPI_ReadChannel(int csPin) {
    digitalWrite(csPin, LOW);
    uint32_t val = SPI.transfer(0x00);
    digitalWrite(csPin, HIGH);
    return val;
}
static inline void HAL_SPI_WriteChannel(int csPin, uint32_t val) {
    digitalWrite(csPin, LOW);
    SPI.transfer((uint8_t)val);
    digitalWrite(csPin, HIGH);
}
#endif
`,
    systemInit: `
  init(); // Arduino system init
`,
    serialInit: (_baudRate) => `
  Serial.begin(HIL_BAUDRATE);
`,
    serialReceive: `
  while (Serial.available() > 0) {
      char c = Serial.read();
      if (rx_index < RX_BUF_SIZE - 1) {
          if (c == '\\n') {
              rx_buffer[rx_index] = '\\0';
              HIL_ProcessMessage(rx_buffer);
              rx_index = 0;
          } else {
              rx_buffer[rx_index++] = c;
          }
      } else {
          rx_index = 0;
      }
  }
`,
    serialTransmit: `
void HIL_SendString(const char* str) {
    Serial.print(str);
}
`,
    tickDelay: `delay(10);`,
    peripherals: {
      GPIO: {
        init: (pin, name, dir) => `  pinMode(${formatArduinoPinExpr(pin)}, ${dir === 'In' ? 'INPUT' : 'OUTPUT'});`,
        read: (pin) => `digitalRead(${formatArduinoPinExpr(pin)}) == HIGH`,
        write: (pin, name, valExpr) => `digitalWrite(${formatArduinoPinExpr(pin)}, (${valExpr}) ? HIGH : LOW);`
      },
      ADC: {
        init: (pin) => `  pinMode(${formatArduinoPinExpr(pin)}, INPUT);`,
        read: (pin) => `analogRead(${formatArduinoPinExpr(pin)})`,
        write: () => `/* Analog Read Pins are input only */`
      },
      DAC: {
        init: () => ``,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `analogWrite(${formatArduinoPinExpr(pin)}, ${valExpr}); /* Pseudo-DAC via PWM on Uno */`
      },
      PWM: {
        init: (pin) => `  pinMode(${formatArduinoPinExpr(pin)}, OUTPUT);`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `analogWrite(${formatArduinoPinExpr(pin)}, ${valExpr});`
      },
      UART: {
        init: (pin, name, dir) => `  softSerial.begin(9600);`,
        read: () => `HAL_UART_ReadChannel()`,
        write: (pin, name, valExpr) => `HAL_UART_WriteChannel(${valExpr});`
      },
      SPI: {
        init: (pin) => `  SPI.begin();\n  pinMode(${formatArduinoPinExpr(pin)}, OUTPUT);\n  digitalWrite(${formatArduinoPinExpr(pin)}, HIGH);`,
        read: (pin) => `HAL_SPI_ReadChannel(${formatArduinoPinExpr(pin)})`,
        write: (pin, name, valExpr) => `HAL_SPI_WriteChannel(${formatArduinoPinExpr(pin)}, ${valExpr});`
      },
      I2C: {
        init: () => `  Wire.begin();`,
        read: () => `({ Wire.requestFrom(0x50, 1); Wire.available() ? Wire.read() : 0; })`,
        write: (pin, name, valExpr) => `do { Wire.beginTransmission(0x50); Wire.write((uint8_t)(${valExpr})); Wire.endTransmission(); } while(0);`
      },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `millis()`, write: () => `` }
    }
  },
  Arduino_Mega: {
    name: 'Arduino Mega',
    systemIncludes: `#include "Arduino.h"\n#include <Wire.h>`,
    globals: `
/* HIL Buffer */
#define RX_BUF_SIZE 128
char rx_buffer[RX_BUF_SIZE];
uint8_t rx_index = 0;

#include <SPI.h>

#ifdef __cplusplus
static inline int parseArduinoPin(const char* pinStr) {
    if (!pinStr || !*pinStr) return 0;
    if (pinStr[0] == 'A' || pinStr[0] == 'a') {
#if defined(A0)
        return A0 + atoi(pinStr + 1);
#else
        return 14 + atoi(pinStr + 1);
#endif
    }
    return atoi(pinStr);
}
static inline uint32_t HAL_UART_ReadChannel(void) {
    return Serial1.available() ? (uint32_t)Serial1.read() : 0U;
}
static inline void HAL_UART_WriteChannel(uint32_t val) {
    Serial1.write((uint8_t)val);
}
static inline uint32_t HAL_SPI_ReadChannel(int csPin) {
    digitalWrite(csPin, LOW);
    uint32_t val = SPI.transfer(0x00);
    digitalWrite(csPin, HIGH);
    return val;
}
static inline void HAL_SPI_WriteChannel(int csPin, uint32_t val) {
    digitalWrite(csPin, LOW);
    SPI.transfer((uint8_t)val);
    digitalWrite(csPin, HIGH);
}
#endif
`,
    systemInit: `
  init();
`,
    serialInit: (_baudRate) => `
  Serial.begin(HIL_BAUDRATE);
`,
    serialReceive: `
  while (Serial.available() > 0) {
      char c = Serial.read();
      if (rx_index < RX_BUF_SIZE - 1) {
          if (c == '\\n') {
              rx_buffer[rx_index] = '\\0';
              HIL_ProcessMessage(rx_buffer);
              rx_index = 0;
          } else {
              rx_buffer[rx_index++] = c;
          }
      } else {
          rx_index = 0;
      }
  }
`,
    serialTransmit: `
void HIL_SendString(const char* str) {
    Serial.print(str);
}
`,
    tickDelay: `delay(10);`,
    peripherals: {
      GPIO: {
        init: (pin, name, dir) => `  pinMode(${formatArduinoPinExpr(pin)}, ${dir === 'In' ? 'INPUT' : 'OUTPUT'});`,
        read: (pin) => `digitalRead(${formatArduinoPinExpr(pin)}) == HIGH`,
        write: (pin, name, valExpr) => `digitalWrite(${formatArduinoPinExpr(pin)}, (${valExpr}) ? HIGH : LOW);`
      },
      ADC: {
        init: (pin) => `  pinMode(${formatArduinoPinExpr(pin)}, INPUT);`,
        read: (pin) => `analogRead(${formatArduinoPinExpr(pin)})`,
        write: () => `/* Analog Read Pins are input only */`
      },
      DAC: {
        init: () => ``,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `analogWrite(${formatArduinoPinExpr(pin)}, ${valExpr});`
      },
      PWM: {
        init: (pin) => `  pinMode(${formatArduinoPinExpr(pin)}, OUTPUT);`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `analogWrite(${formatArduinoPinExpr(pin)}, ${valExpr});`
      },
      UART: {
        init: (pin, name, dir) => `  Serial1.begin(9600);`,
        read: () => `HAL_UART_ReadChannel()`,
        write: (pin, name, valExpr) => `HAL_UART_WriteChannel(${valExpr});`
      },
      SPI: {
        init: (pin) => `  SPI.begin();\n  pinMode(${formatArduinoPinExpr(pin)}, OUTPUT);\n  digitalWrite(${formatArduinoPinExpr(pin)}, HIGH);`,
        read: (pin) => `HAL_SPI_ReadChannel(${formatArduinoPinExpr(pin)})`,
        write: (pin, name, valExpr) => `HAL_SPI_WriteChannel(${formatArduinoPinExpr(pin)}, ${valExpr});`
      },
      I2C: {
        init: () => `  Wire.begin();`,
        read: () => `({ Wire.requestFrom(0x50, 1); Wire.available() ? Wire.read() : 0; })`,
        write: (pin, name, valExpr) => `do { Wire.beginTransmission(0x50); Wire.write((uint8_t)(${valExpr})); Wire.endTransmission(); } while(0);`
      },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `millis()`, write: () => `` }
    }
  },
  ESP32: {
    name: 'ESP32 NodeMCU',
    systemIncludes: `#include "Arduino.h"\n#include <Wire.h>`,
    globals: `
/* HIL Buffer */
#define RX_BUF_SIZE 128
char rx_buffer[RX_BUF_SIZE];
uint8_t rx_index = 0;

#include <SPI.h>

#ifdef __cplusplus
static inline int parseArduinoPin(const char* pinStr) {
    if (!pinStr || !*pinStr) return 0;
    if (pinStr[0] == 'A' || pinStr[0] == 'a') {
#if defined(A0)
        return A0 + atoi(pinStr + 1);
#else
        return 14 + atoi(pinStr + 1);
#endif
    }
    return atoi(pinStr);
}
static inline int GetLEDCChannel(int pin) {
    switch(pin) {
        case 2: return 0;
        case 4: return 1;
        case 12: return 2;
        case 13: return 3;
        case 14: return 4;
        case 15: return 5;
        case 16: return 6;
        case 17: return 7;
        case 18: return 8;
        case 19: return 9;
        case 21: return 10;
        case 22: return 11;
        case 23: return 12;
        case 25: return 13;
        case 26: return 14;
        case 27: return 15;
        default: return 0;
    }
}
static inline uint32_t HAL_UART_ReadChannel(void) {
    return Serial2.available() ? (uint32_t)Serial2.read() : 0U;
}
static inline void HAL_UART_WriteChannel(uint32_t val) {
    Serial2.write((uint8_t)val);
}
static inline uint32_t HAL_SPI_ReadChannel(int csPin) {
    digitalWrite(csPin, LOW);
    uint32_t val = SPI.transfer(0x00);
    digitalWrite(csPin, HIGH);
    return val;
}
static inline void HAL_SPI_WriteChannel(int csPin, uint32_t val) {
    digitalWrite(csPin, LOW);
    SPI.transfer((uint8_t)val);
    digitalWrite(csPin, HIGH);
}
#endif
`,
    systemInit: `
  // ESP32 system init
`,
    serialInit: (_baudRate) => `
  Serial.begin(HIL_BAUDRATE);
`,
    serialReceive: `
  while (Serial.available() > 0) {
      char c = Serial.read();
      if (rx_index < RX_BUF_SIZE - 1) {
          if (c == '\\n') {
              rx_buffer[rx_index] = '\\0';
              HIL_ProcessMessage(rx_buffer);
              rx_index = 0;
          } else {
              rx_buffer[rx_index++] = c;
          }
      } else {
          rx_index = 0;
      }
  }
`,
    serialTransmit: `
void HIL_SendString(const char* str) {
    Serial.print(str);
}
`,
    tickDelay: `delay(10);`,
    peripherals: {
      GPIO: {
        init: (pin, name, dir) => `  pinMode(${formatArduinoPinExpr(pin)}, ${dir === 'In' ? 'INPUT' : 'OUTPUT'});`,
        read: (pin) => `digitalRead(${formatArduinoPinExpr(pin)}) == HIGH`,
        write: (pin, name, valExpr) => `digitalWrite(${formatArduinoPinExpr(pin)}, (${valExpr}) ? HIGH : LOW);`
      },
      ADC: {
        init: (pin) => `  pinMode(${formatArduinoPinExpr(pin)}, INPUT);`,
        read: (pin) => `analogRead(${formatArduinoPinExpr(pin)})`,
        write: () => `/* ESP32 ADC is input only */`
      },
      DAC: {
        init: (pin) => `  // ESP32 has DAC on Pin 25 and 26. No init needed usually.`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `dacWrite(${formatArduinoPinExpr(pin)}, ${valExpr});`
      },
      PWM: {
        init: (pin, name) => `  ledcAttachPin(atoi("${pin}"), GetLEDCChannel(atoi("${pin}"))); ledcSetup(GetLEDCChannel(atoi("${pin}")), 5000, 8);`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `ledcWrite(GetLEDCChannel(atoi("${pin}")), ${valExpr});`
      },
      UART: {
        init: (pin, name, dir) => `  Serial2.begin(115200, SERIAL_8N1, 16, 17);`,
        read: () => `HAL_UART_ReadChannel()`,
        write: (pin, name, valExpr) => `HAL_UART_WriteChannel(${valExpr});`
      },
      SPI: {
        init: (pin) => `  SPI.begin();\n  pinMode(${formatArduinoPinExpr(pin)}, OUTPUT);\n  digitalWrite(${formatArduinoPinExpr(pin)}, HIGH);`,
        read: (pin) => `HAL_SPI_ReadChannel(${formatArduinoPinExpr(pin)})`,
        write: (pin, name, valExpr) => `HAL_SPI_WriteChannel(${formatArduinoPinExpr(pin)}, ${valExpr});`
      },
      I2C: {
        init: () => `  Wire.begin();`,
        read: () => `({ Wire.requestFrom(0x50, 1); Wire.available() ? Wire.read() : 0; })`,
        write: (pin, name, valExpr) => `do { Wire.beginTransmission(0x50); Wire.write((uint8_t)(${valExpr})); Wire.endTransmission(); } while(0);`
      },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `millis()`, write: () => `` }
    }
  },
  Generic: {
    name: 'Generic C / Linux Platform',
    systemIncludes: `#include <stdio.h>\n#include <string.h>\n#include <stdlib.h>`,
    globals: `
/* Generic software simulations */
static int simulated_inputs[100] = {0};
static int simulated_outputs[100] = {0};
char rx_buffer[256];
int rx_index = 0;

static inline int HIL_GetPinIndex(const char* pin) {
    if (pin == NULL || pin[0] == '\\0') return 0;
    char* endptr;
    long val = strtol(pin, &endptr, 10);
    if (*endptr == '\\0') {
        return (int)(val % 100);
    }
    int hash = 0;
    for (int i = 0; pin[i] != '\\0'; i++) {
        hash = (hash * 31) + pin[i];
    }
    if (hash < 0) hash = -hash;
    return hash % 100;
}

static inline uint32_t HAL_UART_ReadChannel(void) {
    return 0U;
}
static inline void HAL_UART_WriteChannel(uint32_t val) {
    printf("HIL: UART Transmit: %u\\n", val);
}
static inline uint32_t HAL_SPI_ReadChannel(void) {
    return 0U;
}
static inline void HAL_SPI_WriteChannel(uint32_t val) {
    printf("HIL: SPI Transmit: %u\\n", val);
}
`,
    systemInit: `
  printf("HIL: Generic System Initialized\\n");
`,
    serialInit: (_baudRate) => `
  printf("HIL: Serial link initialized at %u baud\\n", (uint32_t)HIL_BAUDRATE);
`,
    serialReceive: `
  /* Stub receive from stdin or simulated file descriptor */
  int c;
  while ((c = getchar()) != EOF && c != '\\n') {
      if (rx_index < 255) {
          rx_buffer[rx_index++] = c;
      }
  }
  if (rx_index > 0) {
      rx_buffer[rx_index] = '\\0';
      HIL_ProcessMessage(rx_buffer);
      rx_index = 0;
  }
`,
    serialTransmit: `
void HIL_SendString(const char* str) {
    printf("%s", str);
    fflush(stdout);
}
`,
    tickDelay: `/* Sleep for 10ms simulation tick */\n#ifdef _WIN32\n    Sleep(10);\n#else\n    usleep(10000);\n#endif`,
    peripherals: {
      GPIO: {
        init: (pin, name, dir) => `  printf("HIL: GPIO %s on Pin %s configured as %s\\n", "${name}", "${pin}", "${dir}");`,
        read: (pin) => `(simulated_inputs[HIL_GetPinIndex("${pin}")] > 0)`,
        write: (pin, name, valExpr) => `simulated_outputs[HIL_GetPinIndex("${pin}")] = (${valExpr}) ? 1 : 0;`
      },
      ADC: {
        init: (pin, name) => `  printf("HIL: ADC %s configured on Pin %s\\n", "${name}", "${pin}");`,
        read: (pin) => `simulated_inputs[HIL_GetPinIndex("${pin}")]`,
        write: () => `/* ADC is read only */`
      },
      DAC: {
        init: (pin, name) => `  printf("HIL: DAC %s configured on Pin %s\\n", "${name}", "${pin}");`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `simulated_outputs[HIL_GetPinIndex("${pin}")] = (int)(${valExpr});`
      },
      PWM: {
        init: (pin, name) => `  printf("HIL: PWM %s configured on Pin %s\\n", "${name}", "${pin}");`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `simulated_outputs[HIL_GetPinIndex("${pin}")] = (int)(${valExpr});`
      },
      UART: {
        init: (pin, name) => `  printf("HIL: UART initialized on Pin %s\\n", "${pin}");`,
        read: () => `HAL_UART_ReadChannel()`,
        write: (pin, name, valExpr) => `HAL_UART_WriteChannel(${valExpr});`
      },
      SPI: {
        init: (pin, name) => `  printf("HIL: SPI initialized on Pin %s\\n", "${pin}");`,
        read: () => `HAL_SPI_ReadChannel()`,
        write: (pin, name, valExpr) => `HAL_SPI_WriteChannel(${valExpr});`
      },
      I2C: {
        init: (pin) => `  printf("HIL: I2C initialized on Pin %s\\n", "${pin}");`,
        read: () => `0`,
        write: (pin, name, valExpr) => `printf("HIL: I2C write to Pin %s: %u\\n", "${pin}", (uint32_t)(${valExpr}));`
      },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `0`, write: () => `` }
    }
  }
};
