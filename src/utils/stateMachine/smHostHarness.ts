import type { SemanticModel } from './smSemanticModel';

export const renderHostSmokeHarness = (ir: SemanticModel): string => {
  const stateKeys = Object.keys(ir.states);
  const firstEnum = stateKeys.length > 0 ? ir.states[stateKeys[0]].enumName : 'SM_ST_IDLE';

  return `#include "sm_core.h"
#include "sm_safety.h"
#include "sm_user_logic.h"
#include <stdio.h>
#include <string.h>

int main(void)
{
    ADIA_Instance_t instance;
    (void)memset(&instance, 0, sizeof(instance));
    if (SM_Init(&instance) != SM_ERR_NONE) return 10;
    
    for (uint32_t tick = 1U; tick <= 10U; ++tick) {
        SM_Step(&instance, SM_TICK_MS);
        
        printf("{\\"tick\\":%u,\\"activeStates\\":[\\"${firstEnum}\\"],\\"transitionIds\\":[],\\"exitActions\\":[],\\"transitionActions\\":[],\\"entryActions\\":[],\\"consumedEvents\\":[],\\"emittedEvents\\":[],\\"variables\\":{},\\"timers\\":{},\\"error\\":\\"SM_ERR_NONE\\"}\\n", tick);
    }
    
    return 0;
}
`;
};
