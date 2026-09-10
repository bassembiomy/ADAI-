/*
 * ADIA Generated Test Suite: timing
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
 * Case ID: SM-TC-TIME-LOWER-10MS
 * Name: Lower timing boundary of 10ms is accepted
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-TIME-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_time_lower_10ms(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TIME-NOMINAL-10MS
 * Name: Nominal step with configured tick interval of 10ms
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-TIME-001
 * Generated Functions: SM_Step
 */
static void test_sm_tc_time_nominal_10ms(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TIME-REJECT-11MS
 * Name: Step duration of 11ms above upper threshold is rejected
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-TIME-005
 * Generated Functions: SM_Step
 */
static void test_sm_tc_time_reject_11ms(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 11);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_TIMING, (uint32_t)SM_GetError(&instance), "error code SM_ERR_TIMING", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TIME-REJECT-9MS
 * Name: Step duration of 9ms below lower threshold is rejected
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-TIME-004
 * Generated Functions: SM_Step
 */
static void test_sm_tc_time_reject_9ms(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 9);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_TIMING, (uint32_t)SM_GetError(&instance), "error code SM_ERR_TIMING", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TIME-SATURATION
 * Name: State timers saturate at UINT32_MAX without rollover
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-TIME-006
 * Generated Functions: SM_Step
 */
static void test_sm_tc_time_saturation(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.state_timers[1] = (uint32_t)4294967294;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)4294967295, instance.state_timers[1], "a timer", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TIME-UPPER-10MS
 * Name: Upper timing boundary of 10ms is accepted
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-TIME-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_time_upper_10ms(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
}

static const ADIA_TestCase s_timing_cases[] = {
    { "SM-TC-TIME-LOWER-10MS", "Lower timing boundary of 10ms is accepted", test_sm_tc_time_lower_10ms },
    { "SM-TC-TIME-NOMINAL-10MS", "Nominal step with configured tick interval of 10ms", test_sm_tc_time_nominal_10ms },
    { "SM-TC-TIME-REJECT-11MS", "Step duration of 11ms above upper threshold is rejected", test_sm_tc_time_reject_11ms },
    { "SM-TC-TIME-REJECT-9MS", "Step duration of 9ms below lower threshold is rejected", test_sm_tc_time_reject_9ms },
    { "SM-TC-TIME-SATURATION", "State timers saturate at UINT32_MAX without rollover", test_sm_tc_time_saturation },
    { "SM-TC-TIME-UPPER-10MS", "Upper timing boundary of 10ms is accepted", test_sm_tc_time_upper_10ms },
};

int run_suite_timing(void)
{
    return ADIA_TestRun(s_timing_cases, sizeof(s_timing_cases) / sizeof(s_timing_cases[0]));
}
