/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Arduino_Mega (Arduino Mega)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#include "mcal_dio.h"
#include "hal_drivers.h"

bool MCAL_Dio_ReadChannel(uint32_t channel) {
    switch (channel) {
    case 1U: return (bool)(HAL_GPIO_Read(PIN_CH_2, "ch_2"));
    default: return false;
    }
}

double MCAL_ReadChannelValue(uint32_t channel) {
    switch (channel) {
    case 1U: return (double)(HAL_GPIO_Read(PIN_CH_2, "ch_2"));
    default: return 0.0;
    }
}

void MCAL_Dio_WriteChannel(uint32_t channel, bool level) {
    switch (channel) {
    case 0U: HAL_GPIO_Write(PIN_CH_1, "ch_1", (bool)(level)); break;
    default: break;
    }
}

void MCAL_WriteChannelValue(uint32_t channel, double value) {
    switch (channel) {
    case 0U: HAL_GPIO_Write(PIN_CH_1, "ch_1", (bool)(value)); break;
    default: break;
    }
}

void MCAL_ApplySafeOutputs(void) { }
void MCAL_Watchdog_Kick(void) { }
