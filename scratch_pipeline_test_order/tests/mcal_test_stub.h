/*
 * ADIA Generated MCAL Test Stub Header
 * Standard: c11
 */
#ifndef MCAL_TEST_STUB_H
#define MCAL_TEST_STUB_H

#include "test_support.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    MCAL_CALL_NONE = 0,
    MCAL_CALL_DIO_READ,
    MCAL_CALL_DIO_WRITE,
    MCAL_CALL_PWM_SET_DUTY,
    MCAL_CALL_ADC_READ,
    MCAL_CALL_WATCHDOG_SERVICE,
    MCAL_CALL_SAFE_OUTPUTS
} MCAL_CallKind;

typedef struct {
    MCAL_CallKind kind;
    const char *function_name;
    uint32_t channel;
    double value;
    uint32_t order;
} MCAL_TestCall;

void MCAL_TestReset(void);
size_t MCAL_TestCount(void);
const MCAL_TestCall *MCAL_TestCallAt(size_t index);
size_t MCAL_TestCountByKind(MCAL_CallKind kind);
size_t MCAL_TestCountByFunction(const char *function_name);

void MCAL_SetChannelInputBool(uint32_t channel, bool val);
void MCAL_SetChannelInputU32(uint32_t channel, uint32_t val);
void MCAL_SetChannelInputDouble(uint32_t channel, double val);

bool MCAL_GetChannelInputBool(uint32_t channel);
uint32_t MCAL_GetChannelInputU32(uint32_t channel);
double MCAL_GetChannelInputDouble(uint32_t channel);

/* Standard AUTOSAR/ADIA MCAL mock functions */
uint8_t Dio_ReadChannel(uint32_t channel);
void Dio_WriteChannel(uint32_t channel, uint8_t level);
void Wdg_Service(void);
void ADIA_Safe_Outputs_Hook(void);

bool MCAL_Dio_ReadChannel(uint32_t channel);
void MCAL_Dio_WriteChannel(uint32_t channel, bool level);
double MCAL_ReadChannelValue(uint32_t channel);
void MCAL_WriteChannelValue(uint32_t channel, double value);
void MCAL_ApplySafeOutputs(void);
void MCAL_Watchdog_Kick(void);

#ifdef __cplusplus
}
#endif

#endif /* MCAL_TEST_STUB_H */
