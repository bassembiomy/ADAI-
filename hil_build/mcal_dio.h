#ifndef MCAL_DIO_H
#define MCAL_DIO_H

#include "sm_config.h"

#define MCAL_CH__34D93ED7_4309_4EA8_B6E3_2CECEA48F7A9 0U

bool MCAL_Dio_ReadChannel(uint32_t channel);
void MCAL_Dio_WriteChannel(uint32_t channel, bool level);
double MCAL_ReadChannelValue(uint32_t channel);
void MCAL_WriteChannelValue(uint32_t channel, double value);
void MCAL_ApplySafeOutputs(void);
void MCAL_Watchdog_Kick(void);

#endif /* MCAL_DIO_H */
