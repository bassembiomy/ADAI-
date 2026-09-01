#include "sm_mapping.h"

/*
 * Active State Mapping
 *
 * Layer | Slot
 * ------------------------------
 * Root | 0
 *
 * Parallel child states are tracked using state_active[].
 * Layer IDs, active-slot IDs, and state IDs are distinct.
 */
const uint32_t SM_State_Parent_Layer_Map[SM_NUM_STATES + 1U] = {
    [0] = 0U,
    [SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = SM_LYR_ROOT_IDX,
    [SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = SM_LYR_ROOT_IDX,
};

const int32_t SM_State_Active_Slot_Map[SM_NUM_STATES + 1U] = {
    [0] = -1,
    [SM_ST__265D4F7C_6336_4720_A143_E009C1002387_IDX] = 0,
    [SM_ST__480C2BB1_273C_4C96_A72C_29B0644F4691_IDX] = 0,
};

const SM_Node_t SM_Layer_Parent_State_Map[SM_NUM_LAYERS] = {
    [SM_LYR_ROOT_IDX] = SM_NODE_INVALID,
};

const int32_t SM_Layer_Active_Slot_Map[SM_NUM_LAYERS] = {
    [SM_LYR_ROOT_IDX] = 0,
};

SM_Error_t SM_Validate_Mapping_Configuration(void)
{
    uint32_t layer_index;
    uint32_t state_index;
    uint32_t parent_layer;
    int32_t slot;
    SM_Node_t parent_state;
    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {
        slot = SM_Layer_Active_Slot_Map[layer_index];
        if ((slot < -1) || (slot >= (int32_t)SM_NUM_ACTIVE_SLOTS)) {
            return SM_ERR_CONFIGURATION;
        }
        parent_state = SM_Layer_Parent_State_Map[layer_index];
        if ((uint32_t)parent_state > SM_NUM_STATES) {
            return SM_ERR_CONFIGURATION;
        }
    }
    for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {
        parent_layer = SM_State_Parent_Layer_Map[state_index];
        if (parent_layer >= SM_NUM_LAYERS) {
            return SM_ERR_CONFIGURATION;
        }
        slot = SM_State_Active_Slot_Map[state_index];
        if ((slot < -1) || (slot >= (int32_t)SM_NUM_ACTIVE_SLOTS)) {
            return SM_ERR_CONFIGURATION;
        }
        if (slot != SM_Layer_Active_Slot_Map[parent_layer]) {
            return SM_ERR_CONFIGURATION;
        }
    }
    return SM_ERR_NONE;
}
