import { TargetMCU, PeripheralType } from './hilTypes';

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

export const hilDriverTemplates: Record<TargetMCU, MCUTemplate> = {
  STM32F4: {
    name: 'STM32F4xx HAL',
    systemIncludes: `#include "stm32f4xx_hal.h"\n#include <string.h>\n#include <stdio.h>`,
    globals: `
UART_HandleTypeDef huart2;
ADC_HandleTypeDef hadc1;
DAC_HandleTypeDef hdac;
TIM_HandleTypeDef htim1;

/* HIL Communication Buffers */
#define RX_BUF_SIZE 128
uint8_t rx_buffer[RX_BUF_SIZE];
uint8_t rx_index = 0;
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
  huart2.Init.BaudRate = ${baudRate};
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
          const port = pin.charAt(0).toUpperCase();
          const pinNum = pin.substring(1);
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
          const port = pin.charAt(0).toUpperCase();
          const pinNum = pin.substring(1);
          return `HAL_GPIO_ReadPin(GPIO${port}, GPIO_PIN_${pinNum}) == GPIO_PIN_SET`;
        },
        write: (pin, name, valExpr) => {
          const port = pin.charAt(0).toUpperCase();
          const pinNum = pin.substring(1);
          return `HAL_GPIO_WritePin(GPIO${port}, GPIO_PIN_${pinNum}, (${valExpr}) ? GPIO_PIN_SET : GPIO_PIN_RESET);`;
        }
      },
      ADC: {
        init: (pin, name) => {
          // Simplistic STM32 ADC setup for channel corresponding to pin
          return `
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
          return `({ \n    uint32_t val = 0;\n    HAL_ADC_Start(&hadc1);\n    if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {\n        val = HAL_ADC_GetValue(&hadc1);\n    }\n    HAL_ADC_Stop(&hadc1);\n    val;\n  })`;
        },
        write: () => `/* ADC is Read-Only */`
      },
      DAC: {
        init: (pin, name) => {
          return `
  /* DAC Init for ${name} (Pin ${pin}) */
  __HAL_RCC_DAC_CLK_ENABLE();
  hdac.Instance = DAC;
  HAL_DAC_Init(&hdac);
  DAC_ChannelConfTypeDef sConfig = {0};
  sConfig.DAC_Trigger = DAC_TRIGGER_NONE;
  sConfig.DAC_OutputBuffer = DAC_OUTPUTBUFFER_ENABLE;
  HAL_DAC_ConfigChannel(&hdac, &sConfig, DAC_CHANNEL_1);
  HAL_DAC_Start(&hdac, DAC_CHANNEL_1);`;
        },
        read: () => `0.0f /* DAC is Write-Only */`,
        write: (pin, name, valExpr) => {
          return `HAL_DAC_SetValue(&hdac, DAC_CHANNEL_1, DAC_ALIGN_12B_R, (uint32_t)(${valExpr}));`;
        }
      },
      PWM: {
        init: (pin, name) => {
          return `
  /* TIM1 PWM Init for ${name} (Pin ${pin}) */
  __HAL_RCC_TIM1_CLK_ENABLE();
  htim1.Instance = TIM1;
  htim1.Init.Prescaler = 84 - 1;
  htim1.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim1.Init.Period = 1000 - 1;
  htim1.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  HAL_TIM_PWM_Init(&htim1);
  TIM_OC_InitTypeDef sConfigOC = {0};
  sConfigOC.OCMode = TIM_OCMODE_PWM1;
  sConfigOC.Pulse = 0;
  sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;
  sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;
  HAL_TIM_PWM_ConfigChannel(&htim1, &sConfigOC, TIM_CHANNEL_1);
  HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);`;
        },
        read: () => `0.0f /* PWM is Write-Only */`,
        write: (pin, name, valExpr) => {
          return `__HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, (uint32_t)(${valExpr}));`;
        }
      },
      UART: {
        init: (pin, name) => `/* Mapped to communication link */`,
        read: () => `0.0f`,
        write: () => `/* Use serial protocol for exchange */`
      },
      SPI: {
        init: () => `/* SPI init code */`,
        read: () => `0`,
        write: () => `/* SPI write */`
      },
      I2C: {
        init: () => `/* I2C init code */`,
        read: () => `0`,
        write: () => `/* I2C write */`
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
    systemIncludes: `#include "stm32f1xx_hal.h"\n#include <string.h>\n#include <stdio.h>`,
    globals: `
UART_HandleTypeDef huart1;
ADC_HandleTypeDef hadc1;

#define RX_BUF_SIZE 128
uint8_t rx_buffer[RX_BUF_SIZE];
uint8_t rx_index = 0;
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
  huart1.Init.BaudRate = ${baudRate};
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
          const port = pin.charAt(0).toUpperCase();
          const pinNum = pin.substring(1);
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
          const port = pin.charAt(0).toUpperCase();
          const pinNum = pin.substring(1);
          return `HAL_GPIO_ReadPin(GPIO${port}, GPIO_PIN_${pinNum}) == GPIO_PIN_SET`;
        },
        write: (pin, name, valExpr) => {
          const port = pin.charAt(0).toUpperCase();
          const pinNum = pin.substring(1);
          return `HAL_GPIO_WritePin(GPIO${port}, GPIO_PIN_${pinNum}, (${valExpr}) ? GPIO_PIN_SET : GPIO_PIN_RESET);`;
        }
      },
      ADC: {
        init: (pin, name) => {
          return `
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
          return `({ \n    uint32_t val = 0;\n    HAL_ADC_Start(&hadc1);\n    if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {\n        val = HAL_ADC_GetValue(&hadc1);\n    }\n    HAL_ADC_Stop(&hadc1);\n    val;\n  })`;
        },
        write: () => `/* ADC is Read-Only */`
      },
      DAC: {
        init: () => ``,
        read: () => `0`,
        write: () => `/* DAC write */`
      },
      PWM: {
        init: () => ``,
        read: () => `0`,
        write: () => `/* PWM write */`
      },
      UART: {
        init: () => ``,
        read: () => `0`,
        write: () => ``
      },
      SPI: { init: () => ``, read: () => `0`, write: () => `` },
      I2C: { init: () => ``, read: () => `0`, write: () => `` },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `HAL_GetTick()`, write: () => `` }
    }
  },
  Arduino_Uno: {
    name: 'Arduino Uno',
    systemIncludes: `#include <Arduino.h>`,
    globals: `
/* HIL Buffer */
String rx_buffer = "";
`,
    systemInit: `
  init(); // Arduino system init
`,
    serialInit: (baudRate) => `
  Serial.begin(${baudRate});
`,
    serialReceive: `
  while (Serial.available() > 0) {
      char c = Serial.read();
      if (c == '\\n') {
          HIL_ProcessMessage(rx_buffer.c_str());
          rx_buffer = "";
      } else {
          rx_buffer += c;
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
        init: (pin, name, dir) => `  pinMode(${pin}, ${dir === 'In' ? 'INPUT' : 'OUTPUT'});`,
        read: (pin) => `digitalRead(${pin}) == HIGH`,
        write: (pin, name, valExpr) => `digitalWrite(${pin}, (${valExpr}) ? HIGH : LOW);`
      },
      ADC: {
        init: (pin) => `  pinMode(${pin}, INPUT);`,
        read: (pin) => `analogRead(${pin})`,
        write: () => `/* Analog Read Pins are input only */`
      },
      DAC: {
        init: () => ``,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `analogWrite(${pin}, ${valExpr}); /* Pseudo-DAC via PWM on Uno */`
      },
      PWM: {
        init: (pin) => `  pinMode(${pin}, OUTPUT);`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `analogWrite(${pin}, ${valExpr});`
      },
      UART: {
        init: () => ``,
        read: () => `0.0f`,
        write: () => ``
      },
      SPI: { init: () => ``, read: () => `0`, write: () => `` },
      I2C: { init: () => ``, read: () => `0`, write: () => `` },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `millis()`, write: () => `` }
    }
  },
  Arduino_Mega: {
    name: 'Arduino Mega',
    systemIncludes: `#include <Arduino.h>`,
    globals: `
String rx_buffer = "";
`,
    systemInit: `
  init();
`,
    serialInit: (baudRate) => `
  Serial.begin(${baudRate});
`,
    serialReceive: `
  while (Serial.available() > 0) {
      char c = Serial.read();
      if (c == '\\n') {
          HIL_ProcessMessage(rx_buffer.c_str());
          rx_buffer = "";
      } else {
          rx_buffer += c;
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
        init: (pin, name, dir) => `  pinMode(${pin}, ${dir === 'In' ? 'INPUT' : 'OUTPUT'});`,
        read: (pin) => `digitalRead(${pin}) == HIGH`,
        write: (pin, name, valExpr) => `digitalWrite(${pin}, (${valExpr}) ? HIGH : LOW);`
      },
      ADC: {
        init: (pin) => `  pinMode(${pin}, INPUT);`,
        read: (pin) => `analogRead(${pin})`,
        write: () => `/* Analog Read Pins are input only */`
      },
      DAC: {
        init: () => ``,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `analogWrite(${pin}, ${valExpr});`
      },
      PWM: {
        init: (pin) => `  pinMode(${pin}, OUTPUT);`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `analogWrite(${pin}, ${valExpr});`
      },
      UART: {
        init: () => ``,
        read: () => `0.0f`,
        write: () => ``
      },
      SPI: { init: () => ``, read: () => `0`, write: () => `` },
      I2C: { init: () => ``, read: () => `0`, write: () => `` },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `millis()`, write: () => `` }
    }
  },
  ESP32: {
    name: 'ESP32 NodeMCU',
    systemIncludes: `#include <Arduino.h>`,
    globals: `
String rx_buffer = "";
`,
    systemInit: `
  // ESP32 system init
`,
    serialInit: (baudRate) => `
  Serial.begin(${baudRate});
`,
    serialReceive: `
  while (Serial.available() > 0) {
      char c = Serial.read();
      if (c == '\\n') {
          HIL_ProcessMessage(rx_buffer.c_str());
          rx_buffer = "";
      } else {
          rx_buffer += c;
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
        init: (pin, name, dir) => `  pinMode(${pin}, ${dir === 'In' ? 'INPUT' : 'OUTPUT'});`,
        read: (pin) => `digitalRead(${pin}) == HIGH`,
        write: (pin, name, valExpr) => `digitalWrite(${pin}, (${valExpr}) ? HIGH : LOW);`
      },
      ADC: {
        init: (pin) => `  pinMode(${pin}, INPUT);`,
        read: (pin) => `analogRead(${pin})`,
        write: () => `/* ESP32 ADC is input only */`
      },
      DAC: {
        init: (pin) => `  // ESP32 has DAC on Pin 25 and 26. No init needed usually.`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `dacWrite(${pin}, ${valExpr});`
      },
      PWM: {
        init: (pin, name) => `  ledcAttachPin(${pin}, 0); ledcSetup(0, 5000, 8); // Setup channel 0, 5kHz, 8bit`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `ledcWrite(0, ${valExpr});`
      },
      UART: {
        init: () => ``,
        read: () => `0.0f`,
        write: () => ``
      },
      SPI: { init: () => ``, read: () => `0`, write: () => `` },
      I2C: { init: () => ``, read: () => `0`, write: () => `` },
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
`,
    systemInit: `
  printf("HIL: Generic System Initialized\\n");
`,
    serialInit: (baudRate) => `
  printf("HIL: Serial link initialized at %d baud\\n", ${baudRate});
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
    tickDelay: `/* Sleep for 10ms simulation tick */\n#ifdef _WIN32\n  #include <windows.h>\n  Sleep(10);\n#else\n  #include <unistd.h>\n  usleep(10000);\n#endif`,
    peripherals: {
      GPIO: {
        init: (pin, name, dir) => `  printf("HIL: GPIO %s on Pin %s configured as %s\\n", "${name}", "${pin}", "${dir}");`,
        read: (pin) => `(simulated_inputs[atoi("${pin}")] > 0)`,
        write: (pin, name, valExpr) => `simulated_outputs[atoi("${pin}")] = (${valExpr}) ? 1 : 0;`
      },
      ADC: {
        init: (pin, name) => `  printf("HIL: ADC %s configured on Pin %s\\n", "${name}", "${pin}");`,
        read: (pin) => `simulated_inputs[atoi("${pin}")]`,
        write: () => `/* ADC is read only */`
      },
      DAC: {
        init: (pin, name) => `  printf("HIL: DAC %s configured on Pin %s\\n", "${name}", "${pin}");`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `simulated_outputs[atoi("${pin}")] = (int)(${valExpr});`
      },
      PWM: {
        init: (pin, name) => `  printf("HIL: PWM %s configured on Pin %s\\n", "${name}", "${pin}");`,
        read: () => `0.0f`,
        write: (pin, name, valExpr) => `simulated_outputs[atoi("${pin}")] = (int)(${valExpr});`
      },
      UART: {
        init: () => ``,
        read: () => `0.0f`,
        write: () => ``
      },
      SPI: { init: () => ``, read: () => `0`, write: () => `` },
      I2C: { init: () => ``, read: () => `0`, write: () => `` },
      CAN: { init: () => ``, read: () => `0`, write: () => `` },
      Timer: { init: () => ``, read: () => `0`, write: () => `` }
    }
  }
};
