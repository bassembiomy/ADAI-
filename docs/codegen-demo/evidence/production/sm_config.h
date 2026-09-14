#ifndef SM_CONFIG_H
#define SM_CONFIG_H

#include <stdbool.h>
#include <stdint.h>

#ifndef SM_ADIA_INSTANCE_FWD
#define SM_ADIA_INSTANCE_FWD
typedef struct ADIA_Instance ADIA_Instance_t;
#endif

#define SM_TICK_MS 10U
#define SM_TICK_TOLERANCE_MS 1U
#define SM_TICK_MIN_MS 9U
#define SM_TICK_MAX_MS 11U
#define SM_NUM_STATES 10U
#define SM_NUM_LAYERS 5U
#define SM_NUM_ACTIVE_SLOTS 4U
#define SM_LYR_ROOT_IDX 0U
#define SM_LYR_HEATER_CHILDREN_IDX 1U
#define SM_LYR_PWM_CHILDREN_IDX 2U
#define SM_LYR_FAN_CHILDREN_IDX 3U
#define SM_LYR_WARMING_REGIONS_IDX 4U
/* State: Heater | Model ID: heater | C enum: SM_ST_HEATER */
#define SM_ST_HEATER_IDX 1U
/* State: Standby | Model ID: standby | C enum: SM_ST_STANDBY */
#define SM_ST_STANDBY_IDX 2U
/* State: Warming | Model ID: warming | C enum: SM_ST_WARMING */
#define SM_ST_WARMING_IDX 3U
/* State: PWM bank | Model ID: pwm_bank | C enum: SM_ST_PWM_BANK */
#define SM_ST_PWM_BANK_IDX 4U
/* State: PWM low | Model ID: pwm_low | C enum: SM_ST_PWM_LOW */
#define SM_ST_PWM_LOW_IDX 5U
/* State: PWM high | Model ID: pwm_high | C enum: SM_ST_PWM_HIGH */
#define SM_ST_PWM_HIGH_IDX 6U
/* State: Fan bank | Model ID: fan_bank | C enum: SM_ST_FAN_BANK */
#define SM_ST_FAN_BANK_IDX 7U
/* State: Fan low | Model ID: fan_low | C enum: SM_ST_FAN_LOW */
#define SM_ST_FAN_LOW_IDX 8U
/* State: Fan high | Model ID: fan_high | C enum: SM_ST_FAN_HIGH */
#define SM_ST_FAN_HIGH_IDX 9U
/* State: Overheat | Model ID: overheat | C enum: SM_ST_OVERHEAT */
#define SM_ST_OVERHEAT_IDX 10U

typedef enum {
    SM_NODE_INVALID = 0,
    SM_ST_HEATER = 1,
    SM_ST_STANDBY = 2,
    SM_ST_WARMING = 3,
    SM_ST_PWM_BANK = 4,
    SM_ST_PWM_LOW = 5,
    SM_ST_PWM_HIGH = 6,
    SM_ST_FAN_BANK = 7,
    SM_ST_FAN_LOW = 8,
    SM_ST_FAN_HIGH = 9,
    SM_ST_OVERHEAT = 10
} SM_Node_t;

typedef enum {
    SM_ERR_NONE = 0,
    SM_ERR_NULL_INSTANCE,
    SM_ERR_TIMING,
    SM_ERR_CONFIGURATION,
    SM_ERR_SAFETY_VIOLATION,
    SM_ERR_XBRIDGES_NUMERIC,
    SM_ERR_INVALID_ARGUMENT
} SM_Error_t;

typedef uint32_t SM_Group_t;

#ifdef SM_TRACE_ENABLED
typedef struct {
    const char *action;
} SM_TraceEvent_t;
typedef void (*SM_TraceSink_t)(const SM_TraceEvent_t *event);
#endif

typedef struct {
    uint16_t duty_cmd;
    uint32_t heat_cycles;
    bool over_temperature;
    double setpoint_c;
    bool start_cmd;
    bool stop_cmd;
} SM_Data_t;

struct ADIA_Instance {
    SM_Data_t data;
    SM_Node_t active_states[(SM_NUM_ACTIVE_SLOTS > 0U) ? SM_NUM_ACTIVE_SLOTS : 1U];
    SM_Node_t history_states[(SM_NUM_ACTIVE_SLOTS > 0U) ? SM_NUM_ACTIVE_SLOTS : 1U];
    bool state_active[SM_NUM_STATES + 1U];
    uint32_t state_timers[SM_NUM_STATES + 1U];
    bool deep_history[SM_NUM_LAYERS][SM_NUM_STATES + 1U];
    SM_Error_t error_status;
    bool fault_latched;
#ifdef SM_TRACE_ENABLED
    SM_TraceSink_t trace_sink;
#endif
};

#endif /* SM_CONFIG_H */
