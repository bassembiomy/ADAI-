#include <stddef.h>
#include "sm_safety.h"
#include "sm_mapping.h"
#include "mcal_dio.h"

static const SM_Node_t SM_State_Parent_Map[SM_NUM_STATES + 1U] = {
    [0] = SM_NODE_INVALID,
    [SM_ST__535DDD5A_C012_46CE_B23C_9A6CE8D81DF6_IDX] = SM_NODE_INVALID,
    [SM_ST__979256A5_9D43_41F5_929F_5B27AD7DEB22_IDX] = SM_NODE_INVALID,
};

static const bool SM_Layer_Has_Children_Map[SM_NUM_LAYERS] = {
    [SM_LYR_ROOT_IDX] = true,
};

static bool SM_Is_Direct_Layer_Child(uint32_t layer_index, SM_Node_t state)
{
    switch (layer_index) {
        case SM_LYR_ROOT_IDX:
            switch (state) {
                case SM_ST__535DDD5A_C012_46CE_B23C_9A6CE8D81DF6: return true;
                case SM_ST__979256A5_9D43_41F5_929F_5B27AD7DEB22: return true;
                default: return false;
            }
        default: return false;
    }
}

static bool SM_Is_Layer_Descendant(uint32_t layer_index, SM_Node_t state)
{
    switch (layer_index) {
        case SM_LYR_ROOT_IDX:
            switch (state) {
                case SM_ST__535DDD5A_C012_46CE_B23C_9A6CE8D81DF6: return true;
                case SM_ST__979256A5_9D43_41F5_929F_5B27AD7DEB22: return true;
                default: return false;
            }
        default: return false;
    }
}

SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t *instance)
{
    uint32_t layer_index;
    uint32_t state_index;
    uint32_t slot_index;
    SM_Node_t active_node;
    SM_Node_t history_node;
    int32_t active_slot;
    SM_Node_t parent;
    bool container_active;
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {
        if (instance->state_active[state_index]) {
            parent = SM_State_Parent_Map[state_index];
            if ((parent != SM_NODE_INVALID)
                && (!instance->state_active[(uint32_t)parent])) {
                return SM_ERR_CONFIGURATION;
            }
            active_slot = SM_State_Active_Slot_Map[state_index];
            if ((active_slot >= 0)
                && (instance->active_states[(uint32_t)active_slot]
                    != (SM_Node_t)state_index)) {
                return SM_ERR_CONFIGURATION;
            }
        }
    }
    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {
        parent = SM_Layer_Parent_State_Map[layer_index];
        container_active = (parent == SM_NODE_INVALID)
            || instance->state_active[(uint32_t)parent];
        active_slot = SM_Layer_Active_Slot_Map[layer_index];
        if (container_active) {
            if (active_slot >= 0) {
                active_node = instance->active_states[(uint32_t)active_slot];
                if ((active_node == SM_NODE_INVALID)
                    || ((uint32_t)active_node > SM_NUM_STATES)
                    || (!SM_Is_Direct_Layer_Child(layer_index, active_node))
                    || (!instance->state_active[(uint32_t)active_node])) {
                    return SM_ERR_CONFIGURATION;
                }
            } else if (SM_Layer_Has_Children_Map[layer_index]) {
                for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {
                    if (SM_Is_Direct_Layer_Child(layer_index, (SM_Node_t)state_index)
                        && (!instance->state_active[state_index])) {
                        return SM_ERR_CONFIGURATION;
                    }
                }
            }
        } else if ((active_slot >= 0)
            && (instance->active_states[(uint32_t)active_slot] != SM_NODE_INVALID)) {
            return SM_ERR_CONFIGURATION;
        }
        if (active_slot >= 0) {
            history_node = instance->history_states[(uint32_t)active_slot];
            if ((history_node != SM_NODE_INVALID)
                && (((uint32_t)history_node > SM_NUM_STATES)
                    || (!SM_Is_Direct_Layer_Child(layer_index, history_node)))) {
                return SM_ERR_CONFIGURATION;
            }
        }
        for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {
            if (instance->deep_history[layer_index][state_index]
                && (!SM_Is_Layer_Descendant(layer_index, (SM_Node_t)state_index))) {
                return SM_ERR_CONFIGURATION;
            }
        }
    }
    for (slot_index = 0U; slot_index < SM_NUM_ACTIVE_SLOTS; ++slot_index) {
        active_node = instance->active_states[slot_index];
        if (active_node != SM_NODE_INVALID) {
            if (((uint32_t)active_node > SM_NUM_STATES)
                || (!instance->state_active[(uint32_t)active_node])
                || (SM_State_Active_Slot_Map[(uint32_t)active_node]
                    != (int32_t)slot_index)) {
                return SM_ERR_CONFIGURATION;
            }
        }
    }
    return SM_ERR_NONE;
}

void SM_ApplySafeOutputs(ADIA_Instance_t *instance)
{
    (void)instance;
    MCAL_Dio_WriteChannel(MCAL_CH__1087003D_EC33_460C_8E0F_C1A9CAC26411, false);
    MCAL_ApplySafeOutputs();
}
