#ifndef SM_CORE_H
#define SM_CORE_H

#include "sm_config.h"

SM_Error_t SM_Init(ADIA_Instance_t *instance);
SM_Error_t SM_Reset(ADIA_Instance_t *instance);
SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance);
SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms);
SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance);
SM_Error_t SM_Sync_IO(ADIA_Instance_t *instance);
SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t group);
SM_Error_t SM_GetError(const ADIA_Instance_t *instance);
#ifdef SM_TRACE_ENABLED
void SM_SetTraceSink(ADIA_Instance_t *instance, SM_TraceSink_t sink);
void SM_TraceAction(ADIA_Instance_t *instance, const char *action);
#else
#define SM_TraceAction(instance, action) ((void)0)
#endif

#endif /* SM_CORE_H */
