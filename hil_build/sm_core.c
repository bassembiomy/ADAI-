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
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = instance->state_active[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = instance->state_active[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX];
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
            case SM_ST__265D4F7C_6336_4720_A143_E009C1002387: SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX); break;
            case SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691: SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX); break;
            default: break;
        }
    }
    switch (state) {
        case SM_ST__265D4F7C_6336_4720_A143_E009C1002387:
            if (!instance->state_active[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX]) { break; }
            SM_ST__265D4F7C_6336_4720_A143_E009C1002387_Exit(instance);
            instance->state_active[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = false;
            instance->state_timers[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = 0U;
            if (instance->active_states[0U] == SM_ST__265D4F7C_6336_4720_A143_E009C1002387) {
                instance->active_states[0U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691:
            if (!instance->state_active[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX]) { break; }
            SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_Exit(instance);
            instance->state_active[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = false;
            instance->state_timers[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = 0U;
            if (instance->active_states[0U] == SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691) {
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
    instance->state_active[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = true;
    instance->state_timers[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = 0U;
    instance->active_states[0U] = SM_ST__265D4F7C_6336_4720_A143_E009C1002387;
    SM_ST__265D4F7C_6336_4720_A143_E009C1002387_Entry(instance);
}

static void SM_Restore_State_1(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = true;
    instance->state_timers[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = 0U;
    instance->active_states[0U] = SM_ST__265D4F7C_6336_4720_A143_E009C1002387;
    SM_ST__265D4F7C_6336_4720_A143_E009C1002387_Entry(instance);
}

static void SM_Enter_Deep_2(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = true;
    instance->state_timers[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = 0U;
    instance->active_states[0U] = SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691;
    SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_Entry(instance);
}

static void SM_Restore_State_2(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = true;
    instance->state_timers[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = 0U;
    instance->active_states[0U] = SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691;
    SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_Entry(instance);
}

static bool SM_Execute_Layer_0(ADIA_Instance_t *instance)
{
    switch (instance->active_states[0U]) {
        case SM_ST__265D4F7C_6336_4720_A143_E009C1002387:
            return SM_Execute_State_1(instance);
        case SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691:
            return SM_Execute_State_2(instance);
        default: return false;
    }
}

/* TRACE-BEGIN: traceId=TRACE-STATE-_265D4F7C_6336_4720_A143_E009C1002387 symbol=SM_ST__265D4F7C_6336_4720_A143_E009C1002387 */
static bool SM_Execute_State_1(ADIA_Instance_t *instance)
{
    /* TRACE-BEGIN: traceId=TRACE-TRANS-_5AB29C58_A51A_4A43_9B5B_55D7DFCC262B symbol=sm_trans__5ab29c58_a51a_4a43_9b5b_55d7dfcc262b */
    if (instance->state_timers[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] >= 500U) {
        SM_Exit_State(instance, SM_ST__265D4F7C_6336_4720_A143_E009C1002387, true);
        instance->state_active[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = true;
        instance->state_timers[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = 0U;
        instance->active_states[0U] = SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691;
        SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_Entry(instance);
        return true;
    }
    /* TRACE-END: traceId=TRACE-TRANS-_5AB29C58_A51A_4A43_9B5B_55D7DFCC262B */
    SM_ST__265D4F7C_6336_4720_A143_E009C1002387_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-_265D4F7C_6336_4720_A143_E009C1002387 */

/* TRACE-BEGIN: traceId=TRACE-STATE-_480C2BB1_273C_4C96_A72C_29B0644F4691 symbol=SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691 */
static bool SM_Execute_State_2(ADIA_Instance_t *instance)
{
    /* TRACE-BEGIN: traceId=TRACE-TRANS-_2FAA2BA2_2593_42FF_B854_71C8016F1F5D symbol=sm_trans__2faa2ba2_2593_42ff_b854_71c8016f1f5d */
    if (instance->state_timers[SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] >= 1000U) {
        SM_Exit_State(instance, SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691, true);
        instance->state_active[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = true;
        instance->state_timers[SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = 0U;
        instance->active_states[0U] = SM_ST__265D4F7C_6336_4720_A143_E009C1002387;
        SM_ST__265D4F7C_6336_4720_A143_E009C1002387_Entry(instance);
        return true;
    }
    /* TRACE-END: traceId=TRACE-TRANS-_2FAA2BA2_2593_42FF_B854_71C8016F1F5D */
    SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-_480C2BB1_273C_4C96_A72C_29B0644F4691 */

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
    instance->data.x = (bool)(false);
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
    instance->data.x = (bool)(false);
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
    if (instance->error_status != SM_ERR_NONE) {
        SM_Enter_Fault(instance);
        return instance->error_status;
    }
    uint32_t tick_delta;
    if (delta_ms >= SM_TICK_MS) {
        tick_delta = delta_ms - SM_TICK_MS;
    } else {
        tick_delta = SM_TICK_MS - delta_ms;
    }
    if (tick_delta > SM_TICK_TOLERANCE_MS) {
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
    if (instance->error_status != SM_ERR_NONE) {
        SM_Enter_Fault(instance);
        return instance->error_status;
    }
    instance->error_status = SM_Validate_State_Consistency(instance);
    if (instance->error_status != SM_ERR_NONE) {
        SM_Enter_Fault(instance);
        return instance->error_status;
    }
    MCAL_Dio_WriteChannel(MCAL_CH__6B8AF776_C9CA_4C37_B295_88950BE006D5, (bool)(instance->data.x));
    MCAL_Watchdog_Kick();
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
