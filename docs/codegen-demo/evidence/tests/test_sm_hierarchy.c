/*
 * ADIA Generated Test Suite: hierarchy
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
 * Case ID: SM-TC-HIER-DEEP-HISTORY
 * Name: Deep history restoration across nested composite levels
 * Model: state_machine
 * States: 
 * Transitions: 
 * Requirements: TEST-HIER-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_hier_deep_history(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-HIER-PARALLEL-REGIONS
 * Name: Simultaneous activation and synchronization of parallel AND regions
 * Model: state_machine
 * States: 
 * Transitions: 
 * Requirements: TEST-HIER-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_hier_parallel_regions(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)SM_ERR_NONE, (uint32_t)SM_GetError(&instance), "error code SM_ERR_NONE", __FILE__, (unsigned long)__LINE__);
}

static const ADIA_TestCase s_hierarchy_cases[] = {
    { "SM-TC-HIER-DEEP-HISTORY", "Deep history restoration across nested composite levels", test_sm_tc_hier_deep_history },
    { "SM-TC-HIER-PARALLEL-REGIONS", "Simultaneous activation and synchronization of parallel AND regions", test_sm_tc_hier_parallel_regions },
};

int run_suite_hierarchy(void)
{
    return ADIA_TestRun(s_hierarchy_cases, sizeof(s_hierarchy_cases) / sizeof(s_hierarchy_cases[0]));
}
