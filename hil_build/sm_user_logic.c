#include "sm_core.h"
#include "sm_user_logic.h"

/* State: State_1 | Model ID: fc452778-f368-4f41-81bd-b1a3d3e2fac9 | C enum: SM_ST_FC452778_F368_4F41_81BD_B1A3D3E2FAC9 */
void SM_ST_FC452778_F368_4F41_81BD_B1A3D3E2FAC9_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_FC452778_F368_4F41_81BD_B1A3D3E2FAC9_During(ADIA_Instance_t *instance)
{
    instance->data.x = (bool)(false);
    SM_TraceAction(instance, "during:FC452778_F368_4F41_81BD_B1A3D3E2FAC9");
}

void SM_ST_FC452778_F368_4F41_81BD_B1A3D3E2FAC9_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: State_2 | Model ID: 71cb93e8-e357-4659-b62f-a3145823df82 | C enum: SM_ST__71CB93E8_E357_4659_B62F_A3145823DF82 */
void SM_ST__71CB93E8_E357_4659_B62F_A3145823DF82_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST__71CB93E8_E357_4659_B62F_A3145823DF82_During(ADIA_Instance_t *instance)
{
    instance->data.x = (bool)(true);
    SM_TraceAction(instance, "during:_71CB93E8_E357_4659_B62F_A3145823DF82");
}

void SM_ST__71CB93E8_E357_4659_B62F_A3145823DF82_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

