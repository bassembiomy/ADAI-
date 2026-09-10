#ifndef SM_MAPPING_H
#define SM_MAPPING_H

#include "sm_config.h"

extern const uint32_t SM_State_Parent_Layer_Map[SM_NUM_STATES + 1U];
extern const int32_t SM_State_Active_Slot_Map[SM_NUM_STATES + 1U];
extern const SM_Node_t SM_Layer_Parent_State_Map[SM_NUM_LAYERS];
extern const int32_t SM_Layer_Active_Slot_Map[SM_NUM_LAYERS];

SM_Error_t SM_Validate_Mapping_Configuration(void);

#endif /* SM_MAPPING_H */
