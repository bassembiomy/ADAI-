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
    /* Inject a safety-class error, then step */
    inst.error_status = SM_ERR_SAFETY_VIOLATION;
    SM_Step(&inst, 10U);
    /* Run exit (+1), Safe entry (+2) => 12 */
    CHECK(inst.data.log == 12U, "exit actions run before safe-state entry");
    CHECK(inst.state_active[SM_ST_SAFE_IDX] == true, "safe state active");
    CHECK(inst.state_active[SM_ST_RUN_IDX] == false, "run state exited");
    if (failures > 0) { printf("RESULT: FAIL (%d)\n", failures); } else { printf("RESULT: PASS\n"); }
    return failures;
}
