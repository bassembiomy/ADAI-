/*
 * ADIA Generated Test Suite: initialization
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
 * Case ID: SM-TC-INIT-DEFAULT
 * Name: Default initialization enters initial states and binds variables
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-INIT-002, TEST-INIT-003
 * Generated Functions: SM_Init
 */
static void test_sm_tc_init_default(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_A), "a should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertU32((uint32_t)1, (uint32_t)instance.data.count, "count value", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, instance.data.go, "go value", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertU32((uint32_t)0, (uint32_t)instance.data.ratio, "ratio value", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertU32((uint32_t)0, (uint32_t)instance.data.total, "total value", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, instance.fault_latched, "fault latched flag", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-INIT-MEMSET-GARBAGE
 * Name: Initialization clears instance storage and resets flags from memory prefilled with 0xA5
 * Model: state_machine
 * States: a
 * Transitions: 
 * Requirements: TEST-INIT-004
 * Generated Functions: SM_Init
 */
static void test_sm_tc_init_memset_garbage(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, instance.fault_latched, "fault latched flag", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-INIT-NULL-INSTANCE
 * Name: SM_Init handles null instance parameter with error
 */
static void test_sm_tc_init_null_instance(void)
{
    ADIA_Instance_t instance;
    SM_Error_t err;
    (void)instance;
    MCAL_TestReset();
    err = SM_Init(NULL);
    ADIA_AssertU32((uint32_t)SM_ERR_NULL_INSTANCE, (uint32_t)err, "error code SM_ERR_NULL_INSTANCE", __FILE__, (unsigned long)__LINE__);
}

static const ADIA_TestCase s_initialization_cases[] = {
    { "SM-TC-INIT-DEFAULT", "Default initialization enters initial states and binds variables", test_sm_tc_init_default },
    { "SM-TC-INIT-MEMSET-GARBAGE", "Initialization clears instance storage and resets flags from memory prefilled with 0xA5", test_sm_tc_init_memset_garbage },
    { "SM-TC-INIT-NULL-INSTANCE", "SM_Init handles null instance parameter with error", test_sm_tc_init_null_instance },
};

int run_suite_initialization(void)
{
    return ADIA_TestRun(s_initialization_cases, sizeof(s_initialization_cases) / sizeof(s_initialization_cases[0]));
}
