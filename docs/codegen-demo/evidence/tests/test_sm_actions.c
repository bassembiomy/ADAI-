/*
 * ADIA Generated Test Suite: actions
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
 * Case ID: SM-TC-ACT-HEATER-DURING
 * Name: During action execution on state Heater
 * Model: state_machine
 * States: heater
 * Transitions: 
 * Requirements: TEST-ACT-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_act_heater_during(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, SM_TICK_MS);
    (void)SM_Sync_IO(&instance);

}

/*
 * Case ID: SM-TC-ACT-HEATER-ENTRY
 * Name: Entry action execution on state Heater
 * Model: state_machine
 * States: heater
 * Transitions: 
 * Requirements: TEST-ACT-001
 * Generated Functions: SM_Step
 */
static void test_sm_tc_act_heater_entry(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, SM_TICK_MS);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)0, (uint32_t)instance.data.heat_cycles, "heat_cycles value", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-ACT-OVERHEAT-ENTRY
 * Name: Entry action execution on state Overheat
 * Model: state_machine
 * States: overheat
 * Transitions: 
 * Requirements: TEST-ACT-001
 * Generated Functions: SM_Step
 */
static void test_sm_tc_act_overheat_entry(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)0, (uint32_t)instance.data.duty_cmd, "duty_cmd value", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-ACT-PWM_HIGH-DURING
 * Name: During action execution on state PWM high
 * Model: state_machine
 * States: pwm_high
 * Transitions: 
 * Requirements: TEST-ACT-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_act_pwm_high_during(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, SM_TICK_MS);
    (void)SM_Sync_IO(&instance);

}

/*
 * Case ID: SM-TC-ACT-PWM_LOW-DURING
 * Name: During action execution on state PWM low
 * Model: state_machine
 * States: pwm_low
 * Transitions: 
 * Requirements: TEST-ACT-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_act_pwm_low_during(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, SM_TICK_MS);
    (void)SM_Sync_IO(&instance);

}

/*
 * Case ID: SM-TC-ACT-STANDBY-ENTRY
 * Name: Entry action execution on state Standby
 * Model: state_machine
 * States: standby
 * Transitions: 
 * Requirements: TEST-ACT-001
 * Generated Functions: SM_Step
 */
static void test_sm_tc_act_standby_entry(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, SM_TICK_MS);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)0, (uint32_t)instance.data.duty_cmd, "duty_cmd value", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-ACT-WARMING-ENTRY
 * Name: Entry action execution on state Warming
 * Model: state_machine
 * States: warming
 * Transitions: 
 * Requirements: TEST-ACT-001
 * Generated Functions: SM_Step
 */
static void test_sm_tc_act_warming_entry(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)250, (uint32_t)instance.data.duty_cmd, "duty_cmd value", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-ACT-WARMING-EXIT
 * Name: Exit action execution on state Warming
 * Model: state_machine
 * States: warming
 * Transitions: 
 * Requirements: TEST-ACT-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_act_warming_exit(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    (void)SM_Step(&instance, SM_TICK_MS);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertU32((uint32_t)0, (uint32_t)instance.data.duty_cmd, "duty_cmd value", __FILE__, (unsigned long)__LINE__);
}

static const ADIA_TestCase s_actions_cases[] = {
    { "SM-TC-ACT-HEATER-DURING", "During action execution on state Heater", test_sm_tc_act_heater_during },
    { "SM-TC-ACT-HEATER-ENTRY", "Entry action execution on state Heater", test_sm_tc_act_heater_entry },
    { "SM-TC-ACT-OVERHEAT-ENTRY", "Entry action execution on state Overheat", test_sm_tc_act_overheat_entry },
    { "SM-TC-ACT-PWM_HIGH-DURING", "During action execution on state PWM high", test_sm_tc_act_pwm_high_during },
    { "SM-TC-ACT-PWM_LOW-DURING", "During action execution on state PWM low", test_sm_tc_act_pwm_low_during },
    { "SM-TC-ACT-STANDBY-ENTRY", "Entry action execution on state Standby", test_sm_tc_act_standby_entry },
    { "SM-TC-ACT-WARMING-ENTRY", "Entry action execution on state Warming", test_sm_tc_act_warming_entry },
    { "SM-TC-ACT-WARMING-EXIT", "Exit action execution on state Warming", test_sm_tc_act_warming_exit },
};

int run_suite_actions(void)
{
    return ADIA_TestRun(s_actions_cases, sizeof(s_actions_cases) / sizeof(s_actions_cases[0]));
}
