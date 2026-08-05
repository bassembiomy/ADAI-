#ifndef SM_SAFETY_H
#define SM_SAFETY_H

#include "sm_config.h"

SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t *instance);
void SM_ApplySafeOutputs(ADIA_Instance_t *instance);

#endif /* SM_SAFETY_H */
