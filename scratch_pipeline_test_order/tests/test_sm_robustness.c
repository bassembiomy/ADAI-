/*
 * ADIA Generated Test Suite: robustness
 * Automatically derived from state machine semantic model.
 */
#include "test_support.h"
#include "mcal_test_stub.h"
#include "sm_core.h"
#include "sm_config.h"
#include "sm_mapping.h"
#include "sm_safety.h"
#include "mcal_dio.h"

/*
 * Case ID: SM-TC-ROB-NULL-STEP
 * Name: SM_Step rejects null instance argument with error
 */
static void test_sm_tc_rob_null_step(void)
{
    ADIA_Instance_t instance;
    SM_Error_t err;
    (void)instance;
    MCAL_TestReset();
    err = SM_Step(NULL, SM_TICK_MS);
    ADIA_AssertU32((uint32_t)SM_ERR_NULL_INSTANCE, (uint32_t)err, "error code SM_ERR_NULL_INSTANCE", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-ROB-REPEATED-CYCLES
 * Name: Repeated step execution across 100000 cycles for stability
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-ROB-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_rob_repeated_cycles(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    {
        size_t cycle;
        for (cycle = 0; cycle < 100000; cycle++) {
            (void)SM_Step(&instance, 10);
        }
        (void)SM_Sync_IO(&instance);
    }

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
}

static const ADIA_TestCase s_robustness_cases[] = {
    { "SM-TC-ROB-NULL-STEP", "SM_Step rejects null instance argument with error", test_sm_tc_rob_null_step },
    { "SM-TC-ROB-REPEATED-CYCLES", "Repeated step execution across 100000 cycles for stability", test_sm_tc_rob_repeated_cycles },
};

int run_suite_robustness(void)
{
    return ADIA_TestRun(s_robustness_cases, sizeof(s_robustness_cases) / sizeof(s_robustness_cases[0]));
}
