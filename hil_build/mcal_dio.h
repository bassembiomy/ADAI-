#ifndef MCAL_DIO_H
#define MCAL_DIO_H

#include <stdbool.h>
#include <stdint.h>

#define MCAL_CH__9B4C84B5_D1BA_413C_83BC_E11F567B19CF 0U
#define MCAL_CH_F0B3089A_1426_4D8A_ADD0_6A146A51378E 1U

bool MCAL_Dio_ReadChannel(uint32_t channel);
void MCAL_Dio_WriteChannel(uint32_t channel, bool level);
double MCAL_ReadChannelValue(uint32_t channel);
void MCAL_WriteChannelValue(uint32_t channel, double value);
void MCAL_ApplySafeOutputs(void);
void MCAL_Watchdog_Kick(void);

#endif /* MCAL_DIO_H */
