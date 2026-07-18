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
    inst.data.t1 = true;
    SM_Step(&inst, 10U);
    inst.data.t1 = false;
    CHECK(inst.state_active[SM_ST_B_IDX] == true, "B active before reset");
    SM_Reset(&inst);
    CHECK(inst.state_active[SM_ST_A_IDX] == true, "A active after reset");
    CHECK(inst.state_active[SM_ST_B_IDX] == false, "B cleared after reset");
    CHECK(inst.state_timers[SM_ST_B_IDX] == 0U, "timers cleared after reset");
    if (failures > 0) { printf("RESULT: FAIL (%d)\n", failures); } else { printf("RESULT: PASS\n"); }
    return failures;
}
