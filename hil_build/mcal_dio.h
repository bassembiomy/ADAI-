#ifndef MCAL_DIO_H
#define MCAL_DIO_H

#include <stdbool.h>
#include <stdint.h>

#define MCAL_CH__6B8AF776_C9CA_4C37_B295_88950BE006D5 0U

bool MCAL_Dio_ReadChannel(uint32_t channel);
void MCAL_Dio_WriteChannel(uint32_t channel, bool level);
double MCAL_ReadChannelValue(uint32_t channel);
void MCAL_WriteChannelValue(uint32_t channel, double value);
void MCAL_ApplySafeOutputs(void);
void MCAL_Watchdog_Kick(void);

#endif /* MCAL_DIO_H */
