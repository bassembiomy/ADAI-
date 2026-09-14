/*
 * ADIA Generated Test Suite: reset
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
 * Case ID: SM-TC-RESET-AUTHORIZED
 * Name: Authorized reset restores initial states, resets timers, and clears error flags
 * Model: state_machine
 * States: heater
 * Transitions: 
 * Requirements: TEST-RESET-001
 * Generated Functions: SM_Reset
 */
static void test_sm_tc_reset_authorized(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);
    (void)SM_Reset(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, instance.fault_latched, "fault latched flag", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-RESET-FAULT-RECOVERY
 * Name: Authorized reset from latched fault clears error latch and recovers normal execution
 * Model: state_machine
 * States: heater
 * Transitions: 
 * Requirements: TEST-RESET-002
 * Generated Functions: SM_Reset
 */
static void test_sm_tc_reset_fault_recovery(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.active_states[0] = (SM_Node_t)999;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);
    (void)SM_Reset(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, instance.fault_latched, "fault latched flag", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-RESET-NULL-INSTANCE
 * Name: SM_Reset returns error when called with null instance pointer
 */
static void test_sm_tc_reset_null_instance(void)
{
    ADIA_Instance_t instance;
    SM_Error_t err;
    (void)instance;
    MCAL_TestReset();
    err = SM_Reset(NULL);
    ADIA_AssertU32((uint32_t)SM_ERR_NULL_INSTANCE, (uint32_t)err, "error code SM_ERR_NULL_INSTANCE", __FILE__, (unsigned long)__LINE__);
}

static const ADIA_TestCase s_reset_cases[] = {
    { "SM-TC-RESET-AUTHORIZED", "Authorized reset restores initial states, resets timers, and clears error flags", test_sm_tc_reset_authorized },
    { "SM-TC-RESET-FAULT-RECOVERY", "Authorized reset from latched fault clears error latch and recovers normal execution", test_sm_tc_reset_fault_recovery },
    { "SM-TC-RESET-NULL-INSTANCE", "SM_Reset returns error when called with null instance pointer", test_sm_tc_reset_null_instance },
};

int run_suite_reset(void)
{
    return ADIA_TestRun(s_reset_cases, sizeof(s_reset_cases) / sizeof(s_reset_cases[0]));
}
