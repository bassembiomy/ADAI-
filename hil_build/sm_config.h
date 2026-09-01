#ifndef SM_CONFIG_H
#define SM_CONFIG_H

#include <stdbool.h>
#include <stdint.h>
#ifndef SM_ADIA_INSTANCE_FWD
#define SM_ADIA_INSTANCE_FWD
typedef struct ADIA_Instance ADIA_Instance_t;
#endif

#define SM_TICK_MS 10U
#define SM_TICK_TOLERANCE_MS ((SM_TICK_MS / 10U) > 0U ? (SM_TICK_MS / 10U) : 1U)
#define SM_NUM_STATES 2U
#define SM_NUM_LAYERS 1U
#define SM_NUM_ACTIVE_SLOTS 1U
#define SM_LYR_ROOT_IDX 0U
/* State: State_1 | Model ID: 265d4f7c-6336-4720-a143-e009c1002387 | C enum: SM_ST__265D4F7C_6336_4720_A143_E009C1002387 */
#define SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX 1U
/* State: State_2 | Model ID: 480c2bb1-273c-4c96-a72c-29b0644f4691 | C enum: SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691 */
#define SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX 2U

typedef enum {
    SM_NODE_INVALID = 0,
    SM_ST__265D4F7C_6336_4720_A143_E009C1002387 = 1,
    SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691 = 2
} SM_Node_t;

typedef enum {
    SM_ERR_NONE = 0,
    SM_ERR_NULL_INSTANCE,
    SM_ERR_TIMING,
    SM_ERR_CONFIGURATION,
    SM_ERR_SAFETY_VIOLATION,
    SM_ERR_XBRIDGES_NUMERIC
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
