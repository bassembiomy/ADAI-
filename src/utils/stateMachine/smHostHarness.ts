import type { SemanticModel } from './smSemanticModel';

export const renderHostSmokeHarness = (ir: SemanticModel): string => {
  void ir;
  return `#include "sm_core.h"
#include "sm_safety.h"
#include "sm_user_logic.h"
#include <stdio.h>
#include <string.h>

int main(void)
{
    ADIA_Instance_t instance;
    (void)memset(&instance, 0xA5, sizeof(instance));
    if (SM_Init(&instance) != SM_ERR_NONE) return 10;
    if (SM_Validate_State_Consistency(&instance) != SM_ERR_NONE) return 11;
    if (SM_Step(&instance, SM_TICK_MS) != SM_ERR_NONE) return 12;
    if (SM_WriteOutputs(&instance) != SM_ERR_NONE) return 13;
    if (SM_Reset(&instance) != SM_ERR_NONE) return 14;
    if (SM_Validate_State_Consistency(&instance) != SM_ERR_NONE) return 15;
    return 0;
}
`;
};
