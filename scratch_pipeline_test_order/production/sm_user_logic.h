#ifndef SM_USER_LOGIC_H
#define SM_USER_LOGIC_H

#include "sm_config.h"

/* State: A | Model ID: a | C enum: SM_ST_A */
void SM_ST_A_Entry(ADIA_Instance_t *instance);
void SM_ST_A_During(ADIA_Instance_t *instance);
void SM_ST_A_Exit(ADIA_Instance_t *instance);
/* State: B | Model ID: b | C enum: SM_ST_B */
void SM_ST_B_Entry(ADIA_Instance_t *instance);
void SM_ST_B_During(ADIA_Instance_t *instance);
void SM_ST_B_Exit(ADIA_Instance_t *instance);

#endif /* SM_USER_LOGIC_H */
