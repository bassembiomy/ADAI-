/**
 * mcalMockGen.ts
 * Generates mock mcal_dio.h header with uint32_t channel parameters for C compiler dry-runs.
 */

export function generateMockMcalHeader(): string {
  return `#ifndef MCAL_DIO_H
#define MCAL_DIO_H

#include <stdint.h>
#include <stdbool.h>

static inline bool MCAL_Dio_ReadChannel(uint32_t channel) {
    (void)channel;
    return false;
}

static inline void MCAL_Dio_WriteChannel(uint32_t channel, bool val) {
    (void)channel;
    (void)val;
}

static inline void MCAL_Watchdog_Kick(void) {}

static inline uint32_t MCAL_Timer_GetMs(void) {
    return 0U;
}

#endif // MCAL_DIO_H
`;
}
