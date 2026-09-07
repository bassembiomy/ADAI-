#include "sm_core.h"
#include "sm_user_logic.h"

/* State: State_1 | Model ID: 535ddd5a-c012-46ce-b23c-9a6ce8d81df6 | C enum: SM_ST__535DDD5A_C012_46CE_B23C_9A6CE8D81DF6 */
void SM_ST__535DDD5A_C012_46CE_B23C_9A6CE8D81DF6_Entry(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST__535DDD5A_C012_46CE_B23C_9A6CE8D81DF6_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST__535DDD5A_C012_46CE_B23C_9A6CE8D81DF6_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: State_2 | Model ID: 979256a5-9d43-41f5-929f-5b27ad7deb22 | C enum: SM_ST__979256A5_9D43_41F5_929F_5B27AD7DEB22 */
void SM_ST__979256A5_9D43_41F5_929F_5B27AD7DEB22_Entry(ADIA_Instance_t *instance)
{
    instance->data.y = (bool)(true);
    SM_TraceAction(instance, "entry:_979256A5_9D43_41F5_929F_5B27AD7DEB22");
}

void SM_ST__979256A5_9D43_41F5_929F_5B27AD7DEB22_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST__979256A5_9D43_41F5_929F_5B27AD7DEB22_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

