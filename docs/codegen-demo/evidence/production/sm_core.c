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
static void SM_Enter_Layer_Default_1(ADIA_Instance_t *instance);
static void SM_Exit_Layer_No_History_1(ADIA_Instance_t *instance);
static bool SM_Execute_Layer_1(ADIA_Instance_t *instance);
static void SM_Enter_Layer_Default_2(ADIA_Instance_t *instance);
static void SM_Exit_Layer_No_History_2(ADIA_Instance_t *instance);
static bool SM_Execute_Layer_2(ADIA_Instance_t *instance);
static void SM_Enter_Layer_Default_3(ADIA_Instance_t *instance);
static void SM_Exit_Layer_No_History_3(ADIA_Instance_t *instance);
static bool SM_Execute_Layer_3(ADIA_Instance_t *instance);
static void SM_Enter_Layer_Default_4(ADIA_Instance_t *instance);
static void SM_Exit_Layer_No_History_4(ADIA_Instance_t *instance);
static bool SM_Execute_Layer_4(ADIA_Instance_t *instance);
static void SM_Enter_Deep_1(ADIA_Instance_t *instance);
static void SM_Restore_State_1(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_1(ADIA_Instance_t *instance);
static void SM_Enter_Deep_2(ADIA_Instance_t *instance);
static void SM_Restore_State_2(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_2(ADIA_Instance_t *instance);
static void SM_Enter_Deep_3(ADIA_Instance_t *instance);
static void SM_Restore_State_3(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_3(ADIA_Instance_t *instance);
static void SM_Enter_Deep_4(ADIA_Instance_t *instance);
static void SM_Restore_State_4(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_4(ADIA_Instance_t *instance);
static void SM_Enter_Deep_5(ADIA_Instance_t *instance);
static void SM_Restore_State_5(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_5(ADIA_Instance_t *instance);
static void SM_Enter_Deep_6(ADIA_Instance_t *instance);
static void SM_Restore_State_6(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_6(ADIA_Instance_t *instance);
static void SM_Enter_Deep_7(ADIA_Instance_t *instance);
static void SM_Restore_State_7(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_7(ADIA_Instance_t *instance);
static void SM_Enter_Deep_8(ADIA_Instance_t *instance);
static void SM_Restore_State_8(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_8(ADIA_Instance_t *instance);
static void SM_Enter_Deep_9(ADIA_Instance_t *instance);
static void SM_Restore_State_9(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_9(ADIA_Instance_t *instance);
static void SM_Enter_Deep_10(ADIA_Instance_t *instance);
static void SM_Restore_State_10(ADIA_Instance_t *instance, uint32_t snapshot_layer);
static bool SM_Execute_State_10(ADIA_Instance_t *instance);
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
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_HEATER_IDX] = instance->state_active[SM_ST_HEATER_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_STANDBY_IDX] = instance->state_active[SM_ST_STANDBY_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_WARMING_IDX] = instance->state_active[SM_ST_WARMING_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_PWM_BANK_IDX] = instance->state_active[SM_ST_PWM_BANK_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_PWM_LOW_IDX] = instance->state_active[SM_ST_PWM_LOW_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_PWM_HIGH_IDX] = instance->state_active[SM_ST_PWM_HIGH_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_FAN_BANK_IDX] = instance->state_active[SM_ST_FAN_BANK_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_FAN_LOW_IDX] = instance->state_active[SM_ST_FAN_LOW_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_FAN_HIGH_IDX] = instance->state_active[SM_ST_FAN_HIGH_IDX];
            instance->deep_history[SM_LYR_ROOT_IDX][SM_ST_OVERHEAT_IDX] = instance->state_active[SM_ST_OVERHEAT_IDX];
            break;
        case SM_LYR_HEATER_CHILDREN_IDX:
            instance->history_states[1U] = instance->active_states[1U];
            instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_STANDBY_IDX] = instance->state_active[SM_ST_STANDBY_IDX];
            instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_WARMING_IDX] = instance->state_active[SM_ST_WARMING_IDX];
            instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_PWM_BANK_IDX] = instance->state_active[SM_ST_PWM_BANK_IDX];
            instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_PWM_LOW_IDX] = instance->state_active[SM_ST_PWM_LOW_IDX];
            instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_PWM_HIGH_IDX] = instance->state_active[SM_ST_PWM_HIGH_IDX];
            instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_FAN_BANK_IDX] = instance->state_active[SM_ST_FAN_BANK_IDX];
            instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_FAN_LOW_IDX] = instance->state_active[SM_ST_FAN_LOW_IDX];
            instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_FAN_HIGH_IDX] = instance->state_active[SM_ST_FAN_HIGH_IDX];
            break;
        case SM_LYR_PWM_CHILDREN_IDX:
            instance->history_states[2U] = instance->active_states[2U];
            instance->deep_history[SM_LYR_PWM_CHILDREN_IDX][SM_ST_PWM_LOW_IDX] = instance->state_active[SM_ST_PWM_LOW_IDX];
            instance->deep_history[SM_LYR_PWM_CHILDREN_IDX][SM_ST_PWM_HIGH_IDX] = instance->state_active[SM_ST_PWM_HIGH_IDX];
            break;
        case SM_LYR_FAN_CHILDREN_IDX:
            instance->history_states[3U] = instance->active_states[3U];
            instance->deep_history[SM_LYR_FAN_CHILDREN_IDX][SM_ST_FAN_LOW_IDX] = instance->state_active[SM_ST_FAN_LOW_IDX];
            instance->deep_history[SM_LYR_FAN_CHILDREN_IDX][SM_ST_FAN_HIGH_IDX] = instance->state_active[SM_ST_FAN_HIGH_IDX];
            break;
        case SM_LYR_WARMING_REGIONS_IDX:
            instance->deep_history[SM_LYR_WARMING_REGIONS_IDX][SM_ST_PWM_BANK_IDX] = instance->state_active[SM_ST_PWM_BANK_IDX];
            instance->deep_history[SM_LYR_WARMING_REGIONS_IDX][SM_ST_PWM_LOW_IDX] = instance->state_active[SM_ST_PWM_LOW_IDX];
            instance->deep_history[SM_LYR_WARMING_REGIONS_IDX][SM_ST_PWM_HIGH_IDX] = instance->state_active[SM_ST_PWM_HIGH_IDX];
            instance->deep_history[SM_LYR_WARMING_REGIONS_IDX][SM_ST_FAN_BANK_IDX] = instance->state_active[SM_ST_FAN_BANK_IDX];
            instance->deep_history[SM_LYR_WARMING_REGIONS_IDX][SM_ST_FAN_LOW_IDX] = instance->state_active[SM_ST_FAN_LOW_IDX];
            instance->deep_history[SM_LYR_WARMING_REGIONS_IDX][SM_ST_FAN_HIGH_IDX] = instance->state_active[SM_ST_FAN_HIGH_IDX];
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
        case SM_LYR_HEATER_CHILDREN_IDX:
            SM_Record_Layer_History(instance, SM_LYR_HEATER_CHILDREN_IDX);
            if (instance->active_states[1U] != SM_NODE_INVALID) {
                SM_Exit_State(instance, instance->active_states[1U], false);
            }
            break;
        case SM_LYR_PWM_CHILDREN_IDX:
            SM_Record_Layer_History(instance, SM_LYR_PWM_CHILDREN_IDX);
            if (instance->active_states[2U] != SM_NODE_INVALID) {
                SM_Exit_State(instance, instance->active_states[2U], false);
            }
            break;
        case SM_LYR_FAN_CHILDREN_IDX:
            SM_Record_Layer_History(instance, SM_LYR_FAN_CHILDREN_IDX);
            if (instance->active_states[3U] != SM_NODE_INVALID) {
                SM_Exit_State(instance, instance->active_states[3U], false);
            }
            break;
        case SM_LYR_WARMING_REGIONS_IDX:
            SM_Record_Layer_History(instance, SM_LYR_WARMING_REGIONS_IDX);
            SM_Exit_State(instance, SM_ST_FAN_BANK, false);
            SM_Exit_State(instance, SM_ST_PWM_BANK, false);
            break;
        default: break;
    }
}

static void SM_Exit_State(ADIA_Instance_t *instance, SM_Node_t state, bool record_containing_layer)
{
    if (record_containing_layer) {
        switch (state) {
            case SM_ST_HEATER: SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX); break;
            case SM_ST_STANDBY: SM_Record_Layer_History(instance, SM_LYR_HEATER_CHILDREN_IDX); break;
            case SM_ST_WARMING: SM_Record_Layer_History(instance, SM_LYR_HEATER_CHILDREN_IDX); break;
            case SM_ST_PWM_BANK: SM_Record_Layer_History(instance, SM_LYR_WARMING_REGIONS_IDX); break;
            case SM_ST_PWM_LOW: SM_Record_Layer_History(instance, SM_LYR_PWM_CHILDREN_IDX); break;
            case SM_ST_PWM_HIGH: SM_Record_Layer_History(instance, SM_LYR_PWM_CHILDREN_IDX); break;
            case SM_ST_FAN_BANK: SM_Record_Layer_History(instance, SM_LYR_WARMING_REGIONS_IDX); break;
            case SM_ST_FAN_LOW: SM_Record_Layer_History(instance, SM_LYR_FAN_CHILDREN_IDX); break;
            case SM_ST_FAN_HIGH: SM_Record_Layer_History(instance, SM_LYR_FAN_CHILDREN_IDX); break;
            case SM_ST_OVERHEAT: SM_Record_Layer_History(instance, SM_LYR_ROOT_IDX); break;
            default: break;
        }
    }
    switch (state) {
        case SM_ST_HEATER:
            if (!instance->state_active[SM_ST_HEATER_IDX]) { break; }
            SM_Exit_Layer(instance, SM_LYR_HEATER_CHILDREN_IDX);
            SM_ST_HEATER_Exit(instance);
            instance->state_active[SM_ST_HEATER_IDX] = false;
            instance->state_timers[SM_ST_HEATER_IDX] = 0U;
            if (instance->active_states[0U] == SM_ST_HEATER) {
                instance->active_states[0U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST_STANDBY:
            if (!instance->state_active[SM_ST_STANDBY_IDX]) { break; }
            SM_ST_STANDBY_Exit(instance);
            instance->state_active[SM_ST_STANDBY_IDX] = false;
            instance->state_timers[SM_ST_STANDBY_IDX] = 0U;
            if (instance->active_states[1U] == SM_ST_STANDBY) {
                instance->active_states[1U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST_WARMING:
            if (!instance->state_active[SM_ST_WARMING_IDX]) { break; }
            SM_Exit_Layer(instance, SM_LYR_WARMING_REGIONS_IDX);
            SM_ST_WARMING_Exit(instance);
            instance->state_active[SM_ST_WARMING_IDX] = false;
            instance->state_timers[SM_ST_WARMING_IDX] = 0U;
            if (instance->active_states[1U] == SM_ST_WARMING) {
                instance->active_states[1U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST_PWM_BANK:
            if (!instance->state_active[SM_ST_PWM_BANK_IDX]) { break; }
            SM_Exit_Layer(instance, SM_LYR_PWM_CHILDREN_IDX);
            SM_ST_PWM_BANK_Exit(instance);
            instance->state_active[SM_ST_PWM_BANK_IDX] = false;
            instance->state_timers[SM_ST_PWM_BANK_IDX] = 0U;
            break;
        case SM_ST_PWM_LOW:
            if (!instance->state_active[SM_ST_PWM_LOW_IDX]) { break; }
            SM_ST_PWM_LOW_Exit(instance);
            instance->state_active[SM_ST_PWM_LOW_IDX] = false;
            instance->state_timers[SM_ST_PWM_LOW_IDX] = 0U;
            if (instance->active_states[2U] == SM_ST_PWM_LOW) {
                instance->active_states[2U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST_PWM_HIGH:
            if (!instance->state_active[SM_ST_PWM_HIGH_IDX]) { break; }
            SM_ST_PWM_HIGH_Exit(instance);
            instance->state_active[SM_ST_PWM_HIGH_IDX] = false;
            instance->state_timers[SM_ST_PWM_HIGH_IDX] = 0U;
            if (instance->active_states[2U] == SM_ST_PWM_HIGH) {
                instance->active_states[2U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST_FAN_BANK:
            if (!instance->state_active[SM_ST_FAN_BANK_IDX]) { break; }
            SM_Exit_Layer(instance, SM_LYR_FAN_CHILDREN_IDX);
            SM_ST_FAN_BANK_Exit(instance);
            instance->state_active[SM_ST_FAN_BANK_IDX] = false;
            instance->state_timers[SM_ST_FAN_BANK_IDX] = 0U;
            break;
        case SM_ST_FAN_LOW:
            if (!instance->state_active[SM_ST_FAN_LOW_IDX]) { break; }
            SM_ST_FAN_LOW_Exit(instance);
            instance->state_active[SM_ST_FAN_LOW_IDX] = false;
            instance->state_timers[SM_ST_FAN_LOW_IDX] = 0U;
            if (instance->active_states[3U] == SM_ST_FAN_LOW) {
                instance->active_states[3U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST_FAN_HIGH:
            if (!instance->state_active[SM_ST_FAN_HIGH_IDX]) { break; }
            SM_ST_FAN_HIGH_Exit(instance);
            instance->state_active[SM_ST_FAN_HIGH_IDX] = false;
            instance->state_timers[SM_ST_FAN_HIGH_IDX] = 0U;
            if (instance->active_states[3U] == SM_ST_FAN_HIGH) {
                instance->active_states[3U] = SM_NODE_INVALID;
            }
            break;
        case SM_ST_OVERHEAT:
            if (!instance->state_active[SM_ST_OVERHEAT_IDX]) { break; }
            SM_ST_OVERHEAT_Exit(instance);
            instance->state_active[SM_ST_OVERHEAT_IDX] = false;
            instance->state_timers[SM_ST_OVERHEAT_IDX] = 0U;
            if (instance->active_states[0U] == SM_ST_OVERHEAT) {
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

static void SM_Exit_Layer_No_History_1(ADIA_Instance_t *instance)
{
    if (instance->active_states[1U] != SM_NODE_INVALID) {
        SM_Exit_State(instance, instance->active_states[1U], false);
    }
}

static void SM_Exit_Layer_No_History_2(ADIA_Instance_t *instance)
{
    if (instance->active_states[2U] != SM_NODE_INVALID) {
        SM_Exit_State(instance, instance->active_states[2U], false);
    }
}

static void SM_Exit_Layer_No_History_3(ADIA_Instance_t *instance)
{
    if (instance->active_states[3U] != SM_NODE_INVALID) {
        SM_Exit_State(instance, instance->active_states[3U], false);
    }
}

static void SM_Exit_Layer_No_History_4(ADIA_Instance_t *instance)
{
    SM_Exit_State(instance, SM_ST_FAN_BANK, false);
    SM_Exit_State(instance, SM_ST_PWM_BANK, false);
}

static void SM_Enter_Layer_Default_0(ADIA_Instance_t *instance)
{
    SM_Enter_Deep_1(instance);
}

static void SM_Enter_Layer_Default_1(ADIA_Instance_t *instance)
{
    SM_Enter_Deep_2(instance);
}

static void SM_Enter_Layer_Default_2(ADIA_Instance_t *instance)
{
    SM_Enter_Deep_5(instance);
}

static void SM_Enter_Layer_Default_3(ADIA_Instance_t *instance)
{
    SM_Enter_Deep_8(instance);
}

static void SM_Enter_Layer_Default_4(ADIA_Instance_t *instance)
{
    SM_Enter_Deep_4(instance);
    SM_Enter_Deep_7(instance);
}

static void SM_Enter_Deep_1(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_HEATER_IDX] = true;
    instance->state_timers[SM_ST_HEATER_IDX] = 0U;
    instance->active_states[0U] = SM_ST_HEATER;
    SM_ST_HEATER_Entry(instance);
    SM_Enter_Layer_Default_1(instance);
}

static void SM_Restore_State_1(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_HEATER_IDX] = true;
    instance->state_timers[SM_ST_HEATER_IDX] = 0U;
    instance->active_states[0U] = SM_ST_HEATER;
    SM_ST_HEATER_Entry(instance);
    if (instance->deep_history[snapshot_layer][SM_ST_STANDBY_IDX] || instance->deep_history[snapshot_layer][SM_ST_WARMING_IDX]) {
        if (instance->deep_history[snapshot_layer][SM_ST_STANDBY_IDX]) {
            SM_Restore_State_2(instance, snapshot_layer);
        }         else if (instance->deep_history[snapshot_layer][SM_ST_WARMING_IDX]) {
            SM_Restore_State_3(instance, snapshot_layer);
        }
    } else {
        SM_Enter_Layer_Default_1(instance);
    }
}

static void SM_Enter_Deep_2(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_STANDBY_IDX] = true;
    instance->state_timers[SM_ST_STANDBY_IDX] = 0U;
    instance->active_states[1U] = SM_ST_STANDBY;
    SM_ST_STANDBY_Entry(instance);
}

static void SM_Restore_State_2(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_STANDBY_IDX] = true;
    instance->state_timers[SM_ST_STANDBY_IDX] = 0U;
    instance->active_states[1U] = SM_ST_STANDBY;
    SM_ST_STANDBY_Entry(instance);
}

static void SM_Enter_Deep_3(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_WARMING_IDX] = true;
    instance->state_timers[SM_ST_WARMING_IDX] = 0U;
    instance->active_states[1U] = SM_ST_WARMING;
    SM_ST_WARMING_Entry(instance);
    SM_Enter_Layer_Default_4(instance);
}

static void SM_Restore_State_3(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_WARMING_IDX] = true;
    instance->state_timers[SM_ST_WARMING_IDX] = 0U;
    instance->active_states[1U] = SM_ST_WARMING;
    SM_ST_WARMING_Entry(instance);
    if (instance->deep_history[snapshot_layer][SM_ST_PWM_BANK_IDX]) {
        SM_Restore_State_4(instance, snapshot_layer);
    } else {
        SM_Enter_Deep_4(instance);
    }
    if (instance->deep_history[snapshot_layer][SM_ST_FAN_BANK_IDX]) {
        SM_Restore_State_7(instance, snapshot_layer);
    } else {
        SM_Enter_Deep_7(instance);
    }
}

static void SM_Enter_Deep_4(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_PWM_BANK_IDX] = true;
    instance->state_timers[SM_ST_PWM_BANK_IDX] = 0U;
    SM_ST_PWM_BANK_Entry(instance);
    SM_Enter_Layer_Default_2(instance);
}

static void SM_Restore_State_4(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_PWM_BANK_IDX] = true;
    instance->state_timers[SM_ST_PWM_BANK_IDX] = 0U;
    SM_ST_PWM_BANK_Entry(instance);
    if (instance->deep_history[snapshot_layer][SM_ST_PWM_LOW_IDX] || instance->deep_history[snapshot_layer][SM_ST_PWM_HIGH_IDX]) {
        if (instance->deep_history[snapshot_layer][SM_ST_PWM_LOW_IDX]) {
            SM_Restore_State_5(instance, snapshot_layer);
        }         else if (instance->deep_history[snapshot_layer][SM_ST_PWM_HIGH_IDX]) {
            SM_Restore_State_6(instance, snapshot_layer);
        }
    } else {
        SM_Enter_Layer_Default_2(instance);
    }
}

static void SM_Enter_Deep_5(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_PWM_LOW_IDX] = true;
    instance->state_timers[SM_ST_PWM_LOW_IDX] = 0U;
    instance->active_states[2U] = SM_ST_PWM_LOW;
    SM_ST_PWM_LOW_Entry(instance);
}

static void SM_Restore_State_5(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_PWM_LOW_IDX] = true;
    instance->state_timers[SM_ST_PWM_LOW_IDX] = 0U;
    instance->active_states[2U] = SM_ST_PWM_LOW;
    SM_ST_PWM_LOW_Entry(instance);
}

static void SM_Enter_Deep_6(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_PWM_HIGH_IDX] = true;
    instance->state_timers[SM_ST_PWM_HIGH_IDX] = 0U;
    instance->active_states[2U] = SM_ST_PWM_HIGH;
    SM_ST_PWM_HIGH_Entry(instance);
}

static void SM_Restore_State_6(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_PWM_HIGH_IDX] = true;
    instance->state_timers[SM_ST_PWM_HIGH_IDX] = 0U;
    instance->active_states[2U] = SM_ST_PWM_HIGH;
    SM_ST_PWM_HIGH_Entry(instance);
}

static void SM_Enter_Deep_7(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_FAN_BANK_IDX] = true;
    instance->state_timers[SM_ST_FAN_BANK_IDX] = 0U;
    SM_ST_FAN_BANK_Entry(instance);
    SM_Enter_Layer_Default_3(instance);
}

static void SM_Restore_State_7(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_FAN_BANK_IDX] = true;
    instance->state_timers[SM_ST_FAN_BANK_IDX] = 0U;
    SM_ST_FAN_BANK_Entry(instance);
    if (instance->deep_history[snapshot_layer][SM_ST_FAN_LOW_IDX] || instance->deep_history[snapshot_layer][SM_ST_FAN_HIGH_IDX]) {
        if (instance->deep_history[snapshot_layer][SM_ST_FAN_LOW_IDX]) {
            SM_Restore_State_8(instance, snapshot_layer);
        }         else if (instance->deep_history[snapshot_layer][SM_ST_FAN_HIGH_IDX]) {
            SM_Restore_State_9(instance, snapshot_layer);
        }
    } else {
        SM_Enter_Layer_Default_3(instance);
    }
}

static void SM_Enter_Deep_8(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_FAN_LOW_IDX] = true;
    instance->state_timers[SM_ST_FAN_LOW_IDX] = 0U;
    instance->active_states[3U] = SM_ST_FAN_LOW;
    SM_ST_FAN_LOW_Entry(instance);
}

static void SM_Restore_State_8(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_FAN_LOW_IDX] = true;
    instance->state_timers[SM_ST_FAN_LOW_IDX] = 0U;
    instance->active_states[3U] = SM_ST_FAN_LOW;
    SM_ST_FAN_LOW_Entry(instance);
}

static void SM_Enter_Deep_9(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_FAN_HIGH_IDX] = true;
    instance->state_timers[SM_ST_FAN_HIGH_IDX] = 0U;
    instance->active_states[3U] = SM_ST_FAN_HIGH;
    SM_ST_FAN_HIGH_Entry(instance);
}

static void SM_Restore_State_9(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_FAN_HIGH_IDX] = true;
    instance->state_timers[SM_ST_FAN_HIGH_IDX] = 0U;
    instance->active_states[3U] = SM_ST_FAN_HIGH;
    SM_ST_FAN_HIGH_Entry(instance);
}

static void SM_Enter_Deep_10(ADIA_Instance_t *instance)
{
    instance->state_active[SM_ST_OVERHEAT_IDX] = true;
    instance->state_timers[SM_ST_OVERHEAT_IDX] = 0U;
    instance->active_states[0U] = SM_ST_OVERHEAT;
    SM_ST_OVERHEAT_Entry(instance);
}

static void SM_Restore_State_10(ADIA_Instance_t *instance, uint32_t snapshot_layer)
{
    (void)snapshot_layer;
    instance->state_active[SM_ST_OVERHEAT_IDX] = true;
    instance->state_timers[SM_ST_OVERHEAT_IDX] = 0U;
    instance->active_states[0U] = SM_ST_OVERHEAT;
    SM_ST_OVERHEAT_Entry(instance);
}

static bool SM_Execute_Layer_0(ADIA_Instance_t *instance)
{
    switch (instance->active_states[0U]) {
        case SM_ST_HEATER:
            return SM_Execute_State_1(instance);
        case SM_ST_OVERHEAT:
            return SM_Execute_State_10(instance);
        default: return false;
    }
}

static bool SM_Execute_Layer_1(ADIA_Instance_t *instance)
{
    switch (instance->active_states[1U]) {
        case SM_ST_STANDBY:
            return SM_Execute_State_2(instance);
        case SM_ST_WARMING:
            return SM_Execute_State_3(instance);
        default: return false;
    }
}

static bool SM_Execute_Layer_2(ADIA_Instance_t *instance)
{
    switch (instance->active_states[2U]) {
        case SM_ST_PWM_LOW:
            return SM_Execute_State_5(instance);
        case SM_ST_PWM_HIGH:
            return SM_Execute_State_6(instance);
        default: return false;
    }
}

static bool SM_Execute_Layer_3(ADIA_Instance_t *instance)
{
    switch (instance->active_states[3U]) {
        case SM_ST_FAN_LOW:
            return SM_Execute_State_8(instance);
        case SM_ST_FAN_HIGH:
            return SM_Execute_State_9(instance);
        default: return false;
    }
}

static bool SM_Execute_Layer_4(ADIA_Instance_t *instance)
{
    bool transitioned = false;
    if (instance->state_active[SM_ST_PWM_BANK_IDX]) {
        transitioned = SM_Execute_State_4(instance) || transitioned;
        if (!instance->state_active[SM_ST_WARMING_IDX]) {
            return transitioned;
        }
    }
    if (instance->state_active[SM_ST_FAN_BANK_IDX]) {
        transitioned = SM_Execute_State_7(instance) || transitioned;
        if (!instance->state_active[SM_ST_WARMING_IDX]) {
            return transitioned;
        }
    }
    return transitioned;
}

/* TRACE-BEGIN: traceId=TRACE-STATE-HEATER symbol=SM_ST_HEATER */
static bool SM_Execute_State_1(ADIA_Instance_t *instance)
{
    bool transitioned = false;
    /* TRACE-BEGIN: traceId=TRACE-TRANS-TRIP_OVERHEAT symbol=sm_trans_trip_overheat */
    if (instance->data.over_temperature) {
        SM_Exit_State(instance, SM_ST_HEATER, true);
        instance->state_active[SM_ST_OVERHEAT_IDX] = true;
        instance->state_timers[SM_ST_OVERHEAT_IDX] = 0U;
        instance->active_states[0U] = SM_ST_OVERHEAT;
        SM_ST_OVERHEAT_Entry(instance);
        return true;
    }
    /* TRACE-END: traceId=TRACE-TRANS-TRIP_OVERHEAT */
    SM_ST_HEATER_During(instance);
    transitioned = SM_Execute_Layer_1(instance) || transitioned;
    if (!instance->state_active[SM_ST_HEATER_IDX]) {
        return transitioned;
    }
    return transitioned;
}
/* TRACE-END: traceId=TRACE-STATE-HEATER */

/* TRACE-BEGIN: traceId=TRACE-STATE-STANDBY symbol=SM_ST_STANDBY */
static bool SM_Execute_State_2(ADIA_Instance_t *instance)
{
    /* TRACE-BEGIN: traceId=TRACE-TRANS-BEGIN_WARMUP symbol=sm_trans_begin_warmup */
    if (instance->data.start_cmd) {
        SM_Exit_State(instance, SM_ST_STANDBY, true);
        instance->data.heat_cycles = (uint32_t)(0U);
        SM_TraceAction(instance, "transition:begin_warmup");
        instance->state_active[SM_ST_WARMING_IDX] = true;
        instance->state_timers[SM_ST_WARMING_IDX] = 0U;
        instance->active_states[1U] = SM_ST_WARMING;
        SM_ST_WARMING_Entry(instance);
        SM_Enter_Layer_Default_4(instance);
        return true;
    }
    /* TRACE-END: traceId=TRACE-TRANS-BEGIN_WARMUP */
    SM_ST_STANDBY_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-STANDBY */

/* TRACE-BEGIN: traceId=TRACE-STATE-WARMING symbol=SM_ST_WARMING */
static bool SM_Execute_State_3(ADIA_Instance_t *instance)
{
    bool transitioned = false;
    SM_ST_WARMING_During(instance);
    transitioned = SM_Execute_Layer_4(instance) || transitioned;
    if (!instance->state_active[SM_ST_WARMING_IDX]) {
        return transitioned;
    }
    return transitioned;
}
/* TRACE-END: traceId=TRACE-STATE-WARMING */

/* TRACE-BEGIN: traceId=TRACE-STATE-PWM_BANK symbol=SM_ST_PWM_BANK */
static bool SM_Execute_State_4(ADIA_Instance_t *instance)
{
    bool transitioned = false;
    SM_ST_PWM_BANK_During(instance);
    transitioned = SM_Execute_Layer_2(instance) || transitioned;
    if (!instance->state_active[SM_ST_PWM_BANK_IDX]) {
        return transitioned;
    }
    return transitioned;
}
/* TRACE-END: traceId=TRACE-STATE-PWM_BANK */

/* TRACE-BEGIN: traceId=TRACE-STATE-PWM_LOW symbol=SM_ST_PWM_LOW */
static bool SM_Execute_State_5(ADIA_Instance_t *instance)
{
    /* TRACE-BEGIN: traceId=TRACE-TRANS-PWM_STEP_UP symbol=sm_trans_pwm_step_up */
    if (instance->state_timers[SM_ST_PWM_LOW_IDX] >= 200U) {
        SM_Exit_State(instance, SM_ST_PWM_LOW, true);
        instance->state_active[SM_ST_PWM_HIGH_IDX] = true;
        instance->state_timers[SM_ST_PWM_HIGH_IDX] = 0U;
        instance->active_states[2U] = SM_ST_PWM_HIGH;
        SM_ST_PWM_HIGH_Entry(instance);
        return true;
    }
    /* TRACE-END: traceId=TRACE-TRANS-PWM_STEP_UP */
    SM_ST_PWM_LOW_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-PWM_LOW */

/* TRACE-BEGIN: traceId=TRACE-STATE-PWM_HIGH symbol=SM_ST_PWM_HIGH */
static bool SM_Execute_State_6(ADIA_Instance_t *instance)
{
    SM_ST_PWM_HIGH_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-PWM_HIGH */

/* TRACE-BEGIN: traceId=TRACE-STATE-FAN_BANK symbol=SM_ST_FAN_BANK */
static bool SM_Execute_State_7(ADIA_Instance_t *instance)
{
    bool transitioned = false;
    SM_ST_FAN_BANK_During(instance);
    transitioned = SM_Execute_Layer_3(instance) || transitioned;
    if (!instance->state_active[SM_ST_FAN_BANK_IDX]) {
        return transitioned;
    }
    return transitioned;
}
/* TRACE-END: traceId=TRACE-STATE-FAN_BANK */

/* TRACE-BEGIN: traceId=TRACE-STATE-FAN_LOW symbol=SM_ST_FAN_LOW */
static bool SM_Execute_State_8(ADIA_Instance_t *instance)
{
    /* TRACE-BEGIN: traceId=TRACE-TRANS-FAN_STEP_UP symbol=sm_trans_fan_step_up */
    if (instance->data.start_cmd) {
        SM_Exit_State(instance, SM_ST_FAN_LOW, true);
        instance->state_active[SM_ST_FAN_HIGH_IDX] = true;
        instance->state_timers[SM_ST_FAN_HIGH_IDX] = 0U;
        instance->active_states[3U] = SM_ST_FAN_HIGH;
        SM_ST_FAN_HIGH_Entry(instance);
        return true;
    }
    /* TRACE-END: traceId=TRACE-TRANS-FAN_STEP_UP */
    SM_ST_FAN_LOW_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-FAN_LOW */

/* TRACE-BEGIN: traceId=TRACE-STATE-FAN_HIGH symbol=SM_ST_FAN_HIGH */
static bool SM_Execute_State_9(ADIA_Instance_t *instance)
{
    SM_ST_FAN_HIGH_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-FAN_HIGH */

/* TRACE-BEGIN: traceId=TRACE-STATE-OVERHEAT symbol=SM_ST_OVERHEAT */
static bool SM_Execute_State_10(ADIA_Instance_t *instance)
{
    /* TRACE-BEGIN: traceId=TRACE-TRANS-RESUME_HEATER symbol=sm_trans_resume_heater */
    if (instance->data.stop_cmd) {
        SM_Exit_State(instance, SM_ST_OVERHEAT, true);
        instance->state_active[SM_ST_HEATER_IDX] = true;
        instance->state_timers[SM_ST_HEATER_IDX] = 0U;
        instance->active_states[0U] = SM_ST_HEATER;
        SM_ST_HEATER_Entry(instance);
        if (instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_STANDBY_IDX]) {
            SM_Restore_State_2(instance, SM_LYR_HEATER_CHILDREN_IDX);
        }         else if (instance->deep_history[SM_LYR_HEATER_CHILDREN_IDX][SM_ST_WARMING_IDX]) {
            SM_Restore_State_3(instance, SM_LYR_HEATER_CHILDREN_IDX);
        }
        else {
            SM_Enter_Layer_Default_1(instance);
        }
        return true;
    }
    /* TRACE-END: traceId=TRACE-TRANS-RESUME_HEATER */
    SM_ST_OVERHEAT_During(instance);
    return false;
}
/* TRACE-END: traceId=TRACE-STATE-OVERHEAT */

static void SM_Exit_All(ADIA_Instance_t *instance)
{
    SM_Exit_Layer(instance, SM_LYR_ROOT_IDX);
}

static void SM_Enter_Safe_State(ADIA_Instance_t *instance)
{
    if (!instance->state_active[SM_ST_OVERHEAT_IDX]) {
        instance->state_active[SM_ST_OVERHEAT_IDX] = true;
        instance->state_timers[SM_ST_OVERHEAT_IDX] = 0U;
        instance->active_states[0U] = SM_ST_OVERHEAT;
        SM_ST_OVERHEAT_Entry(instance);
    }
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
    (void)SM_Exit_Layer_No_History_1;
    (void)SM_Exit_Layer_No_History_2;
    (void)SM_Exit_Layer_No_History_3;
    (void)SM_Exit_Layer_No_History_4;
    (void)SM_Enter_Deep_1;
    (void)SM_Restore_State_1;
    (void)SM_Enter_Deep_2;
    (void)SM_Restore_State_2;
    (void)SM_Enter_Deep_3;
    (void)SM_Restore_State_3;
    (void)SM_Enter_Deep_4;
    (void)SM_Restore_State_4;
    (void)SM_Enter_Deep_5;
    (void)SM_Restore_State_5;
    (void)SM_Enter_Deep_6;
    (void)SM_Restore_State_6;
    (void)SM_Enter_Deep_7;
    (void)SM_Restore_State_7;
    (void)SM_Enter_Deep_8;
    (void)SM_Restore_State_8;
    (void)SM_Enter_Deep_9;
    (void)SM_Restore_State_9;
    (void)SM_Enter_Deep_10;
    (void)SM_Restore_State_10;
    instance->data.duty_cmd = (uint16_t)(0U);
    instance->data.heat_cycles = (uint32_t)(0U);
    instance->data.over_temperature = (bool)(false);
    instance->data.setpoint_c = (double)(180.0);
    instance->data.start_cmd = (bool)(false);
    instance->data.stop_cmd = (bool)(false);
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
    instance->data.duty_cmd = (uint16_t)(0U);
    instance->data.heat_cycles = (uint32_t)(0U);
    instance->data.over_temperature = (bool)(false);
    instance->data.setpoint_c = (double)(180.0);
    instance->data.start_cmd = (bool)(false);
    instance->data.stop_cmd = (bool)(false);
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
