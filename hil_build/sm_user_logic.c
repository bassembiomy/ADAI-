#include "sm_core.h"
#include "sm_user_logic.h"

/* State: State_1 | Model ID: f250e7aa-b1cb-41f0-8e88-74ba0068c2b8 | C enum: SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8 */
void SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_F250E7AA_B1CB_41F0_8E88_74BA0068C2B8_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: State_2 | Model ID: 9ec22ae9-b1db-4ec4-8fac-5712a1840705 | C enum: SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705 */
void SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_During(ADIA_Instance_t *instance)
{
    instance->data.y = (int32_t)(1);
    SM_TraceAction(instance, "during:_9EC22AE9_B1DB_4EC4_8FAC_5712A1840705");
}

void SM_ST__9EC22AE9_B1DB_4EC4_8FAC_5712A1840705_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

