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
#include "hal_config.h"

void HAL_Drivers_Init(void);
bool HAL_GPIO_Read(const char* pin, const char* name);
void HAL_GPIO_Write(const char* pin, const char* name, bool value);
uint32_t HAL_ADC_Read(const char* pin, const char* name);
void HAL_DAC_Write(const char* pin, const char* name, uint32_t value);
void HAL_PWM_Write(const char* pin, const char* name, uint32_t value);
void HIL_SendString(const char* str);
void HIL_Receive_Poll(void);

#endif /* HAL_DRIVERS_H */