#ifndef ADIA_COMPONENT_H
#define ADIA_COMPONENT_H

#include "sm_core.h"

SM_Error_t ADIA_Component_Init(ADIA_Instance_t *instance);
SM_Error_t ADIA_Component_Cyclic(ADIA_Instance_t *instance, uint32_t observed_delta_ms);

#endif /* ADIA_COMPONENT_H */
