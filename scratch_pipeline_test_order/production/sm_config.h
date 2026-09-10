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
#define SM_NUM_STATES 2U
#define SM_NUM_LAYERS 1U
#define SM_NUM_ACTIVE_SLOTS 1U
#define SM_LYR_ROOT_IDX 0U
/* State: A | Model ID: a | C enum: SM_ST_A */
#define SM_ST_A_IDX 1U
/* State: B | Model ID: b | C enum: SM_ST_B */
#define SM_ST_B_IDX 2U

typedef enum {
    SM_NODE_INVALID = 0,
    SM_ST_A = 1,
    SM_ST_B = 2
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
    double count;
    bool go;
    double ratio;
    double total;
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
