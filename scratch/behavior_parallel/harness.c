#include "sm_core.h"
#include <stdio.h>

static int failures = 0;
#define CHECK(cond, msg) do { \
    if (!(cond)) { printf("FAIL: %s\n", msg); failures++; } \
    else { printf("ok: %s\n", msg); } \
} while (0)

int main(void) {
    ADIA_Instance_t inst;

    SM_Init(&inst);
    CHECK(inst.state_active[SM_ST_PARA_IDX] == true, "region R1 state active");
    CHECK(inst.state_active[SM_ST_PARB_IDX] == true, "region R2 state active");
    CHECK(SM_GetActive(&inst, SM_GRP_R1) == SM_ST_PARA, "SM_GetActive returns R1 state");
    CHECK(SM_GetActive(&inst, SM_GRP_R2) == SM_ST_PARB, "SM_GetActive returns R2 state");
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    CHECK(inst.data.log == 101U, "both parallel during actions ran");
    if (failures > 0) { printf("RESULT: FAIL (%d)\n", failures); } else { printf("RESULT: PASS\n"); }
    return failures;
}
