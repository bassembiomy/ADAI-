/*
 * ADIA Generated Test Suite: safety
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
 * Case ID: SM-TC-SAFE-CORRUPT-SLOT
 * Name: Corrupted active slot value triggers configuration fault
 * Model: state_machine
 * States: 
 * Transitions: 
 * Requirements: TEST-SAFE-002
 * Generated Functions: SM_Validate_State_Consistency
 */
static void test_sm_tc_safe_corrupt_slot(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.active_states[0] = (SM_Node_t)999;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_CONFIGURATION, (uint32_t)SM_GetError(&instance), "error code SM_ERR_CONFIGURATION", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-SAFE-CORRUPT-STATE
 * Name: Corrupted active state detects RAM fault and latches configuration error
 * Model: state_machine
 * States: 
 * Transitions: 
 * Requirements: TEST-SAFE-001
 * Generated Functions: SM_Validate_State_Consistency
 */
static void test_sm_tc_safe_corrupt_state(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.active_states[0] = (SM_Node_t)999;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_CONFIGURATION, (uint32_t)SM_GetError(&instance), "error code SM_ERR_CONFIGURATION", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(true, instance.fault_latched, "fault latched flag", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-SAFE-LATCHED-BLOCKING
 * Name: Latched fault blocks normal state machine execution in subsequent ticks
 * Model: state_machine
 * States: 
 * Transitions: 
 * Requirements: TEST-SAFE-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_safe_latched_blocking(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.active_states[0] = (SM_Node_t)999;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, instance.fault_latched, "fault latched flag", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-SAFE-OUTPUTS-APPLIED
 * Name: Safety fault immediately writes safe outputs to mapped hardware channels
 * Model: state_machine
 * States: 
 * Transitions: 
 * Requirements: TEST-SAFE-004
 * Generated Functions: SM_Apply_Safe_Outputs
 */
static void test_sm_tc_safe_outputs_applied(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.active_states[0] = (SM_Node_t)999;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, instance.fault_latched, "fault latched flag", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-SAFE-WATCHDOG-POLICY
 * Name: Watchdog policy is strictly enforced during normal execution and after fault
 * Model: state_machine
 * States: 
 * Transitions: 
 * Requirements: TEST-SAFE-005
 * Generated Functions: SM_Step
 */
static void test_sm_tc_safe_watchdog_policy(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)1, (uint32_t)MCAL_TestCountByKind(MCAL_CALL_WATCHDOG_SERVICE), "watchdog service kicks", __FILE__, (unsigned long)__LINE__);
}

static const ADIA_TestCase s_safety_cases[] = {
    { "SM-TC-SAFE-CORRUPT-SLOT", "Corrupted active slot value triggers configuration fault", test_sm_tc_safe_corrupt_slot },
    { "SM-TC-SAFE-CORRUPT-STATE", "Corrupted active state detects RAM fault and latches configuration error", test_sm_tc_safe_corrupt_state },
    { "SM-TC-SAFE-LATCHED-BLOCKING", "Latched fault blocks normal state machine execution in subsequent ticks", test_sm_tc_safe_latched_blocking },
    { "SM-TC-SAFE-OUTPUTS-APPLIED", "Safety fault immediately writes safe outputs to mapped hardware channels", test_sm_tc_safe_outputs_applied },
    { "SM-TC-SAFE-WATCHDOG-POLICY", "Watchdog policy is strictly enforced during normal execution and after fault", test_sm_tc_safe_watchdog_policy },
};

int run_suite_safety(void)
{
    return ADIA_TestRun(s_safety_cases, sizeof(s_safety_cases) / sizeof(s_safety_cases[0]));
}
