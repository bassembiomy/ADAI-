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
    inst.data.log = 0U;
    inst.data.t1 = true;
    SM_Step(&inst, 10U);
    /* exit A (+1), action (+2), entry B (+3) => 123 */
    CHECK(inst.data.log == 123U, "exit-action-entry order");
    CHECK(inst.state_active[SM_ST_B_IDX] == true, "B active after transition");
    CHECK(inst.state_active[SM_ST_A_IDX] == false, "A inactive after transition");
    if (failures > 0) { printf("RESULT: FAIL (%d)\n", failures); } else { printf("RESULT: PASS\n"); }
    return failures;
}
