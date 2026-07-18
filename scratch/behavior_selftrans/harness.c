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
    inst.data.t1 = false;
    /* External self: exit S1 (+1), entry S1 (+2) => 12 */
    CHECK(inst.data.log == 12U, "external self-transition exits and re-enters");
    CHECK(inst.state_active[SM_ST_S1_IDX] == true, "S1 still active");

    inst.data.log = 0U;
    inst.data.t2 = true;
    SM_Step(&inst, 10U);
    inst.data.t2 = false;
    /* S1->S2: exit S1 (+1), entry S2 (+3) => 13 */
    CHECK(inst.data.log == 13U, "S1->S2 transition");
    CHECK(inst.state_active[SM_ST_S2_IDX] == true, "S2 active");

    inst.data.t3 = true;
    SM_Step(&inst, 10U);
    inst.data.t3 = false;
    /* Internal self: action only (+5) => 135 */
    CHECK(inst.data.log == 135U, "internal self-transition runs action without exit/entry");
    CHECK(inst.state_active[SM_ST_S2_IDX] == true, "S2 still active");
    if (failures > 0) { printf("RESULT: FAIL (%d)\n", failures); } else { printf("RESULT: PASS\n"); }
    return failures;
}
