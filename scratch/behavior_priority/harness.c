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
    SM_Step(&inst, 10U);
    CHECK(inst.state_active[SM_ST_B_IDX] == true, "order-1 transition to B wins");
    CHECK(inst.state_active[SM_ST_C_IDX] == false, "order-2 transition to C loses");
    if (failures > 0) { printf("RESULT: FAIL (%d)\n", failures); } else { printf("RESULT: PASS\n"); }
    return failures;
}
