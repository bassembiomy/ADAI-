#include <float.h>
#include <limits.h>
#include <math.h>
#include <stddef.h>
#include <string.h>
#include "sm_core.h"
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
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX] = instance->state_active[SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = instance->state_active[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX];
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
            case SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8: SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX); break;
            case SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705: SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX); break;
            default: break;
        }
    }
    switch (state) {
        case SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8:
            if (!instance->state_active[SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX]) { break; }
            SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_Exit(instance);
            instance->state_active[SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX] = false;
            instance->state_timers[SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX] = 0U;
            if (instance->active_states[0U] == SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8) {
                instance->active_states[0U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705:
            if (!instance->state_active[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX]) { break; }
            SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_Exit(instance);
            instance->state_active[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = false;
            instance->state_timers[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = 0U;
            if (instance->active_states[0U] == SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705) {
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
    instance->state_active[SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX] = true;
    instance->state_timers[SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX] = 0U;
    instance->active_states[0U] = SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8;
    SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_Entry(instance);
}

static void SM_Restore_State_1(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX] = true;
    instance->state_timers[SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_IDX] = 0U;
    instance->active_states[0U] = SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8;
    SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_Entry(instance);
}

static void SM_Enter_Deep_2(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = true;
    instance->state_timers[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = 0U;
    instance->active_states[0U] = SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705;
    SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_Entry(instance);
}

static void SM_Restore_State_2(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = true;
    instance->state_timers[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = 0U;
    instance->active_states[0U] = SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705;
    SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_Entry(instance);
}

static bool SM_Execute_Layer_0(ADIA_Instance_t *instance)
{
    switch (instance->active_states[0U]) {
        case SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8:
            return SM_Execute_State_1(instance);
        case SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705:
            return SM_Execute_State_2(instance);
        default: return false;
    }
}

static bool SM_Execute_State_1(ADIA_Instance_t *instance)
{
    if (instance->data.x == 1) {
        SM_Exit_State(instance, SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8, true);
        instance->state_active[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = true;
        instance->state_timers[SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_IDX] = 0U;
        instance->active_states[0U] = SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705;
        SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_Entry(instance);
        return true;
    }
    SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_During(instance);
    return false;
}

static bool SM_Execute_State_2(ADIA_Instance_t *instance)
{
    SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_During(instance);
    return false;
}

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
    instance->data.x = (int32_t)(0);
    instance->data.y = (int32_t)(0);
    for (layer_index = 0U; layer_index < SM_NUM_ACTIVE_SLOTS; ++layer_index) {
        instance->active_states[layer_index] = SM_NODE_INVALID;
        instance->history_states[layer_index] = SM_NODE_INVALID;
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
    return SM_ERR_NONE;
}

SM_Error_t SM_Reset(ADIA_Instance_t *instance)
{
    uint32_t layer_index;
    uint32_t state_index;
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    SM_Exit_Layer(instance, SM_LYR_ROOT_IDX);
    instance->data.x = (int32_t)(0);
    instance->data.y = (int32_t)(0);
    for (layer_index = 0U; layer_index < SM_NUM_ACTIVE_SLOTS; ++layer_index) {
        instance->active_states[layer_index] = SM_NODE_INVALID;
        instance->history_states[layer_index] = SM_NODE_INVALID;
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
    instance->data.x = (int32_t)(MCAL_Dio_ReadChannel(MCAL_CH_F0B3089A_1426_4D8A_ADD0_6A146A51378E));
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
    MCAL_WriteChannelValue(MCAL_CH__9B4C84B5_D1BA_413C_83BC_E11F567B19CF, (double)(instance->data.y));
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

SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t group)
{
    if ((instance == NULL) || (group >= SM_NUM_ACTIVE_SLOTS)) {
        return SM_NODE_INVALID;
    }
    return instance->active_states[group];
}

SM_Error_t SM_GetError(const ADIA_Instance_t *instance)
{
    return instance == NULL ? SM_ERR_NULL_INSTANCE : instance->error_status;
}
