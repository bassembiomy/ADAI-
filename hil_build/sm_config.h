#ifndef SM_CONFIG_H
#define SM_CONFIG_H

#include <stdbool.h>
#include <stdint.h>

#ifndef SM_ADIA_INSTANCE_FWD
#define SM_ADIA_INSTANCE_FWD
typedef struct ADIA_Instance ADIA_Instance_t;
#endif

#define SM_TICK_MS 500U
#define SM_TICK_TOLERANCE_MS 50U
#define SM_TICK_MIN_MS 450U
#define SM_TICK_MAX_MS 550U
#define SM_NUM_STATES 2U
#define SM_NUM_LAYERS 1U
#define SM_NUM_ACTIVE_SLOTS 1U
#define SM_LYR_ROOT_IDX 0U
/* State: State_1 | Model ID: c00e5706-9069-434b-abe0-239fb4101411 | C enum: SM_ST_C00E5706_9069_434B_ABE0_239FB4101411 */
#define SM_ST_C00E5706_9069_434B_ABE0_239FB4101411_IDX 1U
/* State: State_1_copy | Model ID: c10ea879-22fb-4440-9bc7-5c73603d14f8 | C enum: SM_ST_C10EA879_22FB_4440_9BC7_5C73603D14F8 */
#define SM_ST_C10EA879_22FB_4440_9BC7_5C73603D14F8_IDX 2U

typedef enum {
    SM_NODE_INVALID = 0,
    SM_ST_C00E5706_9069_434B_ABE0_239FB4101411 = 1,
    SM_ST_C10EA879_22FB_4440_9BC7_5C73603D14F8 = 2
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
    bool x;
    bool y;
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
