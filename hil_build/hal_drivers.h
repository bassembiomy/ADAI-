/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Arduino_Mega (Arduino Mega)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#ifndef HAL_DRIVERS_H
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

#endif /* HAL_DRIVERS_H */