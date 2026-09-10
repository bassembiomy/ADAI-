/*
 * ADIA Generated MCAL Test Stub Implementation
 * Standard: c11
 */
#include "mcal_test_stub.h"
#include <string.h>

#define MCAL_CALL_CAPACITY 64
#define MCAL_CHANNEL_CAPACITY 64

static MCAL_TestCall s_calls[MCAL_CALL_CAPACITY];
static size_t s_call_count = 0;
static uint32_t s_call_order = 0;

static double s_channel_inputs[MCAL_CHANNEL_CAPACITY];
static bool s_channel_has_input[MCAL_CHANNEL_CAPACITY];

void MCAL_TestReset(void)
{
    size_t i;
    (void)memset(s_calls, 0, sizeof(s_calls));
    s_call_count = 0;
    s_call_order = 0;

    for (i = 0; i < MCAL_CHANNEL_CAPACITY; i++) {
        s_channel_inputs[i] = 0.0;
        s_channel_has_input[i] = false;
    }
}

size_t MCAL_TestCount(void)
{
    return s_call_count;
}

const MCAL_TestCall *MCAL_TestCallAt(size_t index)
{
    if (index >= s_call_count) {
        return NULL;
    }
    return &s_calls[index];
}

size_t MCAL_TestCountByKind(MCAL_CallKind kind)
{
    size_t i;
    size_t matching = 0;
    for (i = 0; i < s_call_count; i++) {
        if (s_calls[i].kind == kind) {
            matching++;
        }
    }
    return matching;
}

size_t MCAL_TestCountByFunction(const char *function_name)
{
    size_t i;
    size_t matching = 0;
    if (function_name == NULL) return 0;
    for (i = 0; i < s_call_count; i++) {
        if (s_calls[i].function_name != NULL) {
            if (strcmp(s_calls[i].function_name, function_name) == 0) {
                matching++;
            } else if ((strcmp(function_name, "MCAL_Dio_ReadChannel") == 0 && strcmp(s_calls[i].function_name, "Dio_ReadChannel") == 0)
                    || (strcmp(function_name, "MCAL_Dio_WriteChannel") == 0 && strcmp(s_calls[i].function_name, "Dio_WriteChannel") == 0)) {
                matching++;
            }
        }
    }
    return matching;
}

static void recordCall(MCAL_CallKind kind, const char *fn_name, uint32_t channel, double val)
{
    if (s_call_count < (size_t)MCAL_CALL_CAPACITY) {
        s_calls[s_call_count].kind = kind;
        s_calls[s_call_count].function_name = fn_name;
        s_calls[s_call_count].channel = channel;
        s_calls[s_call_count].value = val;
        s_calls[s_call_count].order = s_call_order++;
        s_call_count++;
    }
}

void MCAL_SetChannelInputBool(uint32_t channel, bool val)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY) {
        s_channel_inputs[channel] = val ? 1.0 : 0.0;
        s_channel_has_input[channel] = true;
    }
}

void MCAL_SetChannelInputU32(uint32_t channel, uint32_t val)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY) {
        s_channel_inputs[channel] = (double)val;
        s_channel_has_input[channel] = true;
    }
}

void MCAL_SetChannelInputDouble(uint32_t channel, double val)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY) {
        s_channel_inputs[channel] = val;
        s_channel_has_input[channel] = true;
    }
}

bool MCAL_GetChannelInputBool(uint32_t channel)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        return s_channel_inputs[channel] != 0.0;
    }
    return false;
}

uint32_t MCAL_GetChannelInputU32(uint32_t channel)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        return (uint32_t)s_channel_inputs[channel];
    }
    return 0;
}

double MCAL_GetChannelInputDouble(uint32_t channel)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        return s_channel_inputs[channel];
    }
    return 0.0;
}

uint8_t Dio_ReadChannel(uint32_t channel)
{
    double val = 0.0;
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        val = s_channel_inputs[channel];
    }
    recordCall(MCAL_CALL_DIO_READ, "Dio_ReadChannel", channel, val);
    return (uint8_t)(val != 0.0 ? 1 : 0);
}

void Dio_WriteChannel(uint32_t channel, uint8_t level)
{
    recordCall(MCAL_CALL_DIO_WRITE, "Dio_WriteChannel", channel, (double)level);
}

void Wdg_Service(void)
{
    recordCall(MCAL_CALL_WATCHDOG_SERVICE, "Wdg_Service", 0, 1.0);
}

void ADIA_Safe_Outputs_Hook(void)
{
    recordCall(MCAL_CALL_SAFE_OUTPUTS, "ADIA_Safe_Outputs_Hook", 0, 1.0);
}

bool MCAL_Dio_ReadChannel(uint32_t channel)
{
    return Dio_ReadChannel(channel) != 0U;
}

void MCAL_Dio_WriteChannel(uint32_t channel, bool level)
{
    Dio_WriteChannel(channel, (uint8_t)(level ? 1U : 0U));
}

double MCAL_ReadChannelValue(uint32_t channel)
{
    double val = 0.0;
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        val = s_channel_inputs[channel];
    }
    recordCall(MCAL_CALL_ADC_READ, "Dio_ReadChannel", channel, val);
    return val;
}

void MCAL_WriteChannelValue(uint32_t channel, double value)
{
    recordCall(MCAL_CALL_DIO_WRITE, "Dio_WriteChannel", channel, value);
}

void MCAL_ApplySafeOutputs(void)
{
    ADIA_Safe_Outputs_Hook();
}

void MCAL_Watchdog_Kick(void)
{
    Wdg_Service();
}
