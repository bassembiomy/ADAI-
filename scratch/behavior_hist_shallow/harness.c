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
    inst.data.t1 = true;  SM_Step(&inst, 10U); inst.data.t1 = false;  /* X->Y */
    CHECK(inst.state_active[SM_ST_Y_IDX] == true, "Y active before exit");
    inst.data.t2 = true;  SM_Step(&inst, 10U); inst.data.t2 = false;  /* Y->Out */
    CHECK(inst.state_active[SM_ST_OUT_IDX] == true, "Out active");
    inst.data.t3 = true;  SM_Step(&inst, 10U); inst.data.t3 = false;  /* Out->P restores history */
    CHECK(inst.state_active[SM_ST_A_IDX] == true, "shallow: A restored");
    CHECK(inst.state_active[SM_ST_X_IDX] == true, "shallow: default X entered (not Y)");
    CHECK(inst.state_active[SM_ST_Y_IDX] == false, "shallow: Y not restored");
    if (failures > 0) { printf("RESULT: FAIL (%d)\n", failures); } else { printf("RESULT: PASS\n"); }
    return failures;
}
