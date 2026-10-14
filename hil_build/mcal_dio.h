#ifndef MCAL_DIO_H
#define MCAL_DIO_H

#include "sm_config.h"

#define MCAL_CH__67797E0B_1464_429D_9FED_B7F8ADD5BF54 0U

bool MCAL_Dio_ReadChannel(uint32_t channel);
void MCAL_Dio_WriteChannel(uint32_t channel, bool level);
double MCAL_ReadChannelValue(uint32_t channel);
void MCAL_WriteChannelValue(uint32_t channel, double value);
void MCAL_ApplySafeOutputs(void);
void MCAL_Watchdog_Kick(void);

#endif /* MCAL_DIO_H */
