/*
 * ADIA Generated Test Suite: transitions
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
 * Case ID: SM-TC-TRANS-A-B-FALSE
 * Name: Transition from A to B blocked when condition is false
 * Model: state_machine
 * States: a, b
 * Transitions: t_ab
 * Requirements: TEST-TRANS-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_a_b_false(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = false;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_A), "a should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_B), "b should be inactive", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TRANS-A-B-TRUE
 * Name: Transition from A to B fires when condition is met
 * Model: state_machine
 * States: a, b
 * Transitions: t_ab
 * Requirements: TEST-TRANS-001, TEST-TRANS-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_a_b_true(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = true;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_B), "b should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_A), "a should be inactive", __FILE__, (unsigned long)__LINE__);
    /* Expect transition t_ab fired */
}

static const ADIA_TestCase s_transitions_cases[] = {
    { "SM-TC-TRANS-A-B-FALSE", "Transition from A to B blocked when condition is false", test_sm_tc_trans_a_b_false },
    { "SM-TC-TRANS-A-B-TRUE", "Transition from A to B fires when condition is met", test_sm_tc_trans_a_b_true },
};

int run_suite_transitions(void)
{
    return ADIA_TestRun(s_transitions_cases, sizeof(s_transitions_cases) / sizeof(s_transitions_cases[0]));
}
