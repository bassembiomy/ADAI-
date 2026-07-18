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
    /* After init: P and C active */
    CHECK(inst.state_active[SM_ST_P_IDX] == true, "P active after init");
    CHECK(inst.state_active[SM_ST_C_IDX] == true, "C active after init");

    inst.data.log = 0U;
    inst.data.t1 = true;
    SM_Step(&inst, 10U);
    /* C->Q: exit C (+1), exit P (+2), action (+3), enter Q (+4) => 1234 */
    CHECK(inst.data.log == 1234U, "C->Q exit chain order");
    CHECK(inst.state_active[SM_ST_Q_IDX] == true, "Q active");
    CHECK(inst.state_active[SM_ST_P_IDX] == false, "P exited");
    CHECK(inst.state_active[SM_ST_C_IDX] == false, "C exited");
    inst.data.t1 = false;

    inst.data.log = 0U;
    inst.data.t2 = true;
    SM_Step(&inst, 10U);
    /* Q->D: exit Q (+5), enter P shallow (+6), enter D (+7) => 567 */
    CHECK(inst.data.log == 567U, "Q->D entry chain order");
    CHECK(inst.state_active[SM_ST_P_IDX] == true, "P re-entered");
    CHECK(inst.state_active[SM_ST_D_IDX] == true, "D active");
    if (failures > 0) { printf("RESULT: FAIL (%d)\n", failures); } else { printf("RESULT: PASS\n"); }
    return failures;
}
