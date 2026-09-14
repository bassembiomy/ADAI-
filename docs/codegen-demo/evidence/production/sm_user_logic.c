#include "sm_core.h"
#include "sm_user_logic.h"

/* State: Heater | Model ID: heater | C enum: SM_ST_HEATER */
void SM_ST_HEATER_Entry(ADIA_Instance_t *instance)
{
    instance->data.heat_cycles = (uint32_t)(0U);
    SM_TraceAction(instance, "entry:HEATER");
}

void SM_ST_HEATER_During(ADIA_Instance_t *instance)
{
    instance->data.heat_cycles = (uint32_t)((instance->data.heat_cycles + 1U));
    SM_TraceAction(instance, "during:HEATER");
}

void SM_ST_HEATER_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: Standby | Model ID: standby | C enum: SM_ST_STANDBY */
void SM_ST_STANDBY_Entry(ADIA_Instance_t *instance)
{
    instance->data.duty_cmd = (uint16_t)(0U);
    SM_TraceAction(instance, "entry:STANDBY");
}

void SM_ST_STANDBY_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_STANDBY_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: Warming | Model ID: warming | C enum: SM_ST_WARMING */
void SM_ST_WARMING_Entry(ADIA_Instance_t *instance)
{
    instance->data.duty_cmd = (uint16_t)(250U);
    SM_TraceAction(instance, "entry:WARMING");
}

void SM_ST_WARMING_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_WARMING_Exit(ADIA_Instance_t *instance)
{
    instance->data.duty_cmd = (uint16_t)(0U);
    SM_TraceAction(instance, "exit:WARMING");
}

/* State: PWM bank | Model ID: pwm_bank | C enum: SM_ST_PWM_BANK */
void SM_ST_PWM_BANK_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_PWM_BANK_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_PWM_BANK_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: PWM low | Model ID: pwm_low | C enum: SM_ST_PWM_LOW */
void SM_ST_PWM_LOW_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_PWM_LOW_During(ADIA_Instance_t *instance)
{
    instance->data.duty_cmd = (uint16_t)((instance->data.duty_cmd + 1U));
    SM_TraceAction(instance, "during:PWM_LOW");
}

void SM_ST_PWM_LOW_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: PWM high | Model ID: pwm_high | C enum: SM_ST_PWM_HIGH */
void SM_ST_PWM_HIGH_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_PWM_HIGH_During(ADIA_Instance_t *instance)
{
    instance->data.duty_cmd = (uint16_t)((instance->data.duty_cmd + 5U));
    SM_TraceAction(instance, "during:PWM_HIGH");
}

void SM_ST_PWM_HIGH_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: Fan bank | Model ID: fan_bank | C enum: SM_ST_FAN_BANK */
void SM_ST_FAN_BANK_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_FAN_BANK_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_FAN_BANK_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: Fan low | Model ID: fan_low | C enum: SM_ST_FAN_LOW */
void SM_ST_FAN_LOW_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_FAN_LOW_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_FAN_LOW_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: Fan high | Model ID: fan_high | C enum: SM_ST_FAN_HIGH */
void SM_ST_FAN_HIGH_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_FAN_HIGH_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_FAN_HIGH_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: Overheat | Model ID: overheat | C enum: SM_ST_OVERHEAT */
void SM_ST_OVERHEAT_Entry(ADIA_Instance_t *instance)
{
    instance->data.duty_cmd = (uint16_t)(0U);
    SM_TraceAction(instance, "entry:OVERHEAT");
}

void SM_ST_OVERHEAT_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_OVERHEAT_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

