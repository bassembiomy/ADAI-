#include "sm_core.h"
#include "sm_user_logic.h"

/* State: State_1 | Model ID: c00e5706-9069-434b-abe0-239fb4101411 | C enum: SM_ST_C00E5706_9069_434B_ABE0_239FB4101411 */
void SM_ST_C00E5706_9069_434B_ABE0_239FB4101411_Entry(ADIA_Instance_t *instance)
{
    instance->data.x = (bool)(false);
    SM_TraceAction(instance, "entry:C00E5706_9069_434B_ABE0_239FB4101411");
}

void SM_ST_C00E5706_9069_434B_ABE0_239FB4101411_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_C00E5706_9069_434B_ABE0_239FB4101411_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

/* State: State_1_copy | Model ID: c10ea879-22fb-4440-9bc7-5c73603d14f8 | C enum: SM_ST_C10EA879_22FB_4440_9BC7_5C73603D14F8 */
void SM_ST_C10EA879_22FB_4440_9BC7_5C73603D14F8_Entry(ADIA_Instance_t *instance)
{
    instance->data.x = (bool)(true);
    SM_TraceAction(instance, "entry:C10EA879_22FB_4440_9BC7_5C73603D14F8");
}

void SM_ST_C10EA879_22FB_4440_9BC7_5C73603D14F8_During(ADIA_Instance_t *instance)
{
    (void)instance;
}

void SM_ST_C10EA879_22FB_4440_9BC7_5C73603D14F8_Exit(ADIA_Instance_t *instance)
{
    (void)instance;
}

