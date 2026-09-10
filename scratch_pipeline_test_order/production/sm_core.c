#include <float.h>
#include <limits.h>
#include <math.h>
#include <stddef.h>
#include <string.h>
#include "sm_core.h"
#include "sm_mapping.h"
#include "sm_safety.h"
#include "sm_user_logic.h"
#include "mcal_dio.h"

#ifdef SM_TRACE_ENABLED
void SM_SetTraceSink(ADIA_Instance_t *instance, SM_TraceSink_t sink)
{
    if (instance != NULL) {
        instance->trace_sink = sink;
    }
}

void SM_TraceAction(ADIA_Instance_t *instance, const char *action)
{
    if ((instance != NULL) && (instance->trace_sink != NULL)) {
        const SM_TraceEvent_t event = { action };
        instance->trace_sink(&event);
    }
}
#endif

static void SM_Enter_Layer_Default_0(ADIA_Instance_t *instance);
static void SM_Exit_Layer_No_History_0(ADIA_Instance_t *instance);
static bool SM_Execute_Layer_0(ADIA_Instance_t *instance);
static void SM_Enter_Deep_1(ADIA_Instance_t *instance);
static void SM_Restore_State_1(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_1(ADIA_Instance_t *instance);
static void SM_Enter_Deep_2(ADIA_Instance_t *instance);
static void SM_Restore_State_2(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_2(ADIA_Instance_t *instance);
static void SM_Record_Layer_History(ADIA_Instance_t *instance, uint32_t layer);
static void SM_Exit_Layer(ADIA_Instance_t *instance, uint32_t layer);
static void SM_Exit_State(ADIA_Instance_t *instance, SM_Node_t state, bool record_containing_layer);
static void SM_Exit_All(ADIA_Instance_t *instance);
static void SM_Enter_Safe_State(ADIA_Instance_t *instance);
static void SM_Enter_Fault(ADIA_Instance_t *instance);

static void SM_Record_Layer_History(ADIA_Instance_t *instance, uint32_t layer)
{
    uint32_t state_index;
    for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {
        instance->deep_history[layer][state_index] = false;
    }
    switch (layer) {
        case SM_LYR_ROOT_IDX:
            instance->history_states[0U] = instance->active_states[0U];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_A_IDX] = instance->state_active[SM_ST_A_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_B_IDX] = instance->state_active[SM_ST_B_IDX];
            break;
        default: break;
    }
}

static void SM_Exit_Layer(ADIA_Instance_t *instance, uint32_t layer)
{
    switch (layer) {
        case SM_LYR_ROOT_IDX:
            SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX);
            if (instance->active_states[0U] != SM_NODE_INVALID) {
                SM_Exit_State(instance, instance->active_states[0U], false);
            }
            break;
        default: break;
    }
}

static void SM_Exit_State(ADIA_Instance_t *instance, SM_Node_t state, bool record_containing_layer)
{
    if (record_containing_layer) {
        switch (state) {
            case SM_ST_A: SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX); break;
            case SM_ST_B: SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX); break;
            default: break;
        }
    }
    switch (state) {
        case SM_ST_A:
            if (!instance->state_active[SM_ST_A_IDX]) { break; }
            SM_ST_A_Exit(instance);
            instance->state_active[SM_ST_A_IDX] = false;
            instance->state_timers[SM_ST_A_IDX] = 0U;
            if (instance->active_states[0U] == SM_ST_A) {
                instance->active_states[0U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST_B:
            if (!instance->state_active[SM_ST_B_IDX]) { break; }
            SM_ST_B_Exit(instance);
            instance->state_active[SM_ST_B_IDX] = false;
            instance->state_timers[SM_ST_B_IDX] = 0U;
            if (instance->active_states[0U] == SM_ST_B) {
                instance->active_states[0U] = SM_NODE_INVALID;
            }
            break;
        default: break;
    }
}

static void SM_Exit_Layer_No_History_0(ADIA_Instance_t *instance)
{
    if (instance->active_states[0U] != SM_NODE_INVALID) {
        SM_Exit_State(instance, instance->active_states[0U], false);
    }
}

static void SM_Enter_Layer_Default_0(ADIA_Instance_t *instance)
{
    SM_Enter_Deep_1(instance);
}

static void SM_Enter_Deep_1(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_A_IDX] = true;
    instance->state_timers[SM_ST_A_IDX] = 0U;
    instance->active_states[0U] = SM_ST_A;
    SM_ST_A_Entry(instance);
}

static void SM_Restore_State_1(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_A_IDX] = true;
    instance->state_timers[SM_ST_A_IDX] = 0U;
    instance->active_states[0U] = SM_ST_A;
    SM_ST_A_Entry(instance);
}

static void SM_Enter_Deep_2(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_B_IDX] = true;
    instance->state_timers[SM_ST_B_IDX] = 0U;
    instance->active_states[0U] = SM_ST_B;
    SM_ST_B_Entry(instance);
}

static void SM_Restore_State_2(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_B_IDX] = true;
    instance->state_timers[SM_ST_B_IDX] = 0U;
    instance->active_states[0U] = SM_ST_B;
    SM_ST_B_Entry(instance);
}

static bool SM_Execute_Layer_0(ADIA_Instance_t *instance)
{
    switch (instance->active_states[0U]) {
        case SM_ST_A:
            return SM_Execute_State_1(instance);
        case SM_ST_B:
            return SM_Execute_State_2(instance);
        default: return false;
    }
}

/* TRACE-BEGIN: traceId=TRACE-STATE-A symbol=SM_ST_A */
static bool SM_Execute_State_1(ADIA_Instance_t *instance)
{
    /* TRACE-BEGIN: traceId=TRACE-TRANS-T_AB symbol=sm_trans_t_ab */
    if (instance->data.go) {
        SM_Exit_State(instance, SM_ST_A, true);
        instance->data.ratio = (double)((instance->data.total / instance->data.count));
        SM_TraceAction(instance, "transition:t_ab");
        instance->state_active[SM_ST_B_IDX] = true;
        instance->state_timers[SM_ST_B_IDX] = 0U;
        instance->active_states[0U] = SM_ST_B;
        SM_ST_B_Entry(instance);
        return true;
    }
    /* TRACE-END: traceId=TRACE-TRANS-T_AB */
    SM_ST_A_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-A */

/* TRACE-BEGIN: traceId=TRACE-STATE-B symbol=SM_ST_B */
static bool SM_Execute_State_2(ADIA_Instance_t *instance)
{
    SM_ST_B_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-B */

static void SM_Exit_All(ADIA_Instance_t *instance)
{
    SM_Exit_Layer(instance, SM_LYR_ROOT_IDX);
}

static void SM_Enter_Safe_State(ADIA_Instance_t *instance)
{
    (void)instance;
}

static void SM_Enter_Fault(ADIA_Instance_t *instance)
{
    if (!instance->fault_latched) {
        SM_Exit_All(instance);
        SM_Enter_Safe_State(instance);
        SM_ApplySafeOutputs(instance);
        instance->fault_latched = true;
    }
}

SM_Error_t SM_Init(ADIA_Instance_t *instance)
{
    uint32_t layer_index;
    uint32_t slot_index;
    uint32_t state_index;
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    (void)memset(instance, 0, sizeof(*instance));
#ifdef SM_TRACE_ENABLED
    instance->trace_sink = NULL;
#endif
    (void)SM_Exit_Layer_No_History_0;
    (void)SM_Enter_Deep_1;
    (void)SM_Restore_State_1;
    (void)SM_Enter_Deep_2;
    (void)SM_Restore_State_2;
    instance->data.count = (double)(1.0);
    instance->data.go = (bool)(false);
    instance->data.ratio = (double)(0.0);
    instance->data.total = (double)(0.0);
    for (slot_index = 0U; slot_index < SM_NUM_ACTIVE_SLOTS; ++slot_index) {
        instance->active_states[slot_index] = SM_NODE_INVALID;
        instance->history_states[slot_index] = SM_NODE_INVALID;
    }
    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {
        for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {
            instance->deep_history[layer_index][state_index] = false;
        }
    }
    for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {
        instance->state_active[state_index] = false;
        instance->state_timers[state_index] = 0U;
    }
    instance->error_status = SM_ERR_NONE;
    instance->fault_latched = false;
    instance->error_status = SM_Validate_Mapping_Configuration();
    if (instance->error_status != SM_ERR_NONE) {
        return SM_ERR_CONFIGURATION;
    }
    SM_Enter_Layer_Default_0(instance);
    return SM_ERR_NONE;
}

SM_Error_t SM_Reset(ADIA_Instance_t *instance)
{
    uint32_t layer_index;
    uint32_t slot_index;
    uint32_t state_index;
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    SM_Exit_Layer(instance, SM_LYR_ROOT_IDX);
    instance->data.count = (double)(1.0);
    instance->data.go = (bool)(false);
    instance->data.ratio = (double)(0.0);
    instance->data.total = (double)(0.0);
    for (slot_index = 0U; slot_index < SM_NUM_ACTIVE_SLOTS; ++slot_index) {
        instance->active_states[slot_index] = SM_NODE_INVALID;
        instance->history_states[slot_index] = SM_NODE_INVALID;
    }
    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {
        for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {
            instance->deep_history[layer_index][state_index] = false;
        }
    }
    for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {
        instance->state_active[state_index] = false;
        instance->state_timers[state_index] = 0U;
    }
    instance->error_status = SM_ERR_NONE;
    instance->fault_latched = false;
    SM_Enter_Layer_Default_0(instance);
    return SM_WriteOutputs(instance);
}

SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    (void)instance;
    return SM_ERR_NONE;
}

SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms)
{
    uint32_t state_index;
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    if (instance->fault_latched || (instance->error_status != SM_ERR_NONE)) {
        SM_Enter_Fault(instance);
        return instance->error_status != SM_ERR_NONE ? instance->error_status : SM_ERR_SAFETY_VIOLATION;
    }
    if ((delta_ms < SM_TICK_MIN_MS) || (delta_ms > SM_TICK_MAX_MS)) {
        instance->error_status = SM_ERR_TIMING;
        SM_Enter_Fault(instance);
        return instance->error_status;
    }
    instance->error_status = SM_Validate_State_Consistency(instance);
    if (instance->error_status != SM_ERR_NONE) {
        SM_Enter_Fault(instance);
        return instance->error_status;
    }
    /* delta_ms is observed physical jitter; SM_TICK_MS is behavioral logical time. */
    for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {
        if (instance->state_active[state_index]) {
            if (SM_TICK_MS > (UINT32_MAX - instance->state_timers[state_index])) {
                instance->state_timers[state_index] = UINT32_MAX;
            } else {
                instance->state_timers[state_index] += SM_TICK_MS;
            }
        }
    }
    (void)SM_Execute_Layer_0(instance);
    if (instance->error_status != SM_ERR_NONE) {
        SM_Enter_Fault(instance);
    }
    return instance->error_status;
}

SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    if (instance->fault_latched || (instance->error_status != SM_ERR_NONE)) {
        SM_Enter_Fault(instance);
        return instance->error_status != SM_ERR_NONE ? instance->error_status : SM_ERR_SAFETY_VIOLATION;
    }
    instance->error_status = SM_Validate_State_Consistency(instance);
    if (instance->error_status != SM_ERR_NONE) {
        SM_Enter_Fault(instance);
        return instance->error_status;
    }
    (void)instance;
    return SM_ERR_NONE;
}

SM_Error_t SM_Sync_IO(ADIA_Instance_t *instance)
{
    SM_Error_t error = SM_ReadInputs(instance);
    if (error == SM_ERR_NONE) {
        error = SM_WriteOutputs(instance);
    }
    return error;
}

SM_Node_t SM_GetActiveSlot(const ADIA_Instance_t *instance, uint32_t slot)
{
    if ((instance == NULL) || (slot >= SM_NUM_ACTIVE_SLOTS)) {
        return SM_NODE_INVALID;
    }
    return instance->active_states[slot];
}

SM_Node_t SM_GetLayerActive(const ADIA_Instance_t *instance, uint32_t layer)
{
    int32_t slot;
    if ((instance == NULL) || (layer >= SM_NUM_LAYERS)) {
        return SM_NODE_INVALID;
    }
    slot = SM_Layer_Active_Slot_Map[layer];
    if (slot < 0) {
        return SM_NODE_INVALID;
    }
    return SM_GetActiveSlot(instance, (uint32_t)slot);
}

bool SM_IsStateActive(const ADIA_Instance_t *instance, SM_Node_t state)
{
    if ((instance == NULL)
        || (state <= SM_NODE_INVALID)
        || ((uint32_t)state > SM_NUM_STATES)) {
        return false;
    }
    return instance->state_active[(uint32_t)state];
}

SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t slot)
{
    return SM_GetActiveSlot(instance, (uint32_t)slot);
}

SM_Error_t SM_GetError(const ADIA_Instance_t *instance)
{
    return instance == NULL ? SM_ERR_NULL_INSTANCE : instance->error_status;
}

#ifdef ADIA_TESTING
SM_Error_t SM_Test_SetActiveState(ADIA_Instance_t *instance, uint32_t slot, SM_Node_t state)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    if ((slot >= SM_NUM_ACTIVE_SLOTS) || ((uint32_t)state > SM_NUM_STATES)) {
        return SM_ERR_INVALID_ARGUMENT;
    }
    instance->active_states[slot] = state;
    return SM_ERR_NONE;
}

SM_Error_t SM_Test_SetStateActive(ADIA_Instance_t *instance, SM_Node_t state, bool active)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    if ((state <= SM_NODE_INVALID) || ((uint32_t)state > SM_NUM_STATES)) {
        return SM_ERR_INVALID_ARGUMENT;
    }
    instance->state_active[(uint32_t)state] = active;
    return SM_ERR_NONE;
}

SM_Error_t SM_Test_SetStateTimer(ADIA_Instance_t *instance, SM_Node_t state, uint32_t timer_ms)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    if ((state <= SM_NODE_INVALID) || ((uint32_t)state > SM_NUM_STATES)) {
        return SM_ERR_INVALID_ARGUMENT;
    }
    instance->state_timers[(uint32_t)state] = timer_ms;
    return SM_ERR_NONE;
}

SM_Error_t SM_Test_SetHistoryState(ADIA_Instance_t *instance, uint32_t slot, SM_Node_t state)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    if ((slot >= SM_NUM_ACTIVE_SLOTS) || ((uint32_t)state > SM_NUM_STATES)) {
        return SM_ERR_INVALID_ARGUMENT;
    }
    instance->history_states[slot] = state;
    return SM_ERR_NONE;
}

SM_Error_t SM_Test_SetDeepHistory(ADIA_Instance_t *instance, uint32_t layer, SM_Node_t state, bool active)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    if ((layer >= SM_NUM_LAYERS) || ((uint32_t)state > SM_NUM_STATES)) {
        return SM_ERR_INVALID_ARGUMENT;
    }
    instance->deep_history[layer][(uint32_t)state] = active;
    return SM_ERR_NONE;
}
#endif
