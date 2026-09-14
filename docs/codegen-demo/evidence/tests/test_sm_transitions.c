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
 * Case ID: SM-TC-TRANS-FAN_LOW-FAN_HIGH-FALSE
 * Name: Transition from Fan low to Fan high blocked when condition is false
 * Model: state_machine
 * States: fan_low, fan_high
 * Transitions: fan_step_up
 * Requirements: TEST-TRANS-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_fan_low_fan_high_false(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = false;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_FAN_LOW), "fan_low should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_FAN_HIGH), "fan_high should be inactive", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TRANS-FAN_LOW-FAN_HIGH-TRUE
 * Name: Transition from Fan low to Fan high fires when condition is met
 * Model: state_machine
 * States: fan_low, fan_high
 * Transitions: fan_step_up
 * Requirements: TEST-TRANS-001, TEST-TRANS-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_fan_low_fan_high_true(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = true;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_FAN_HIGH), "fan_high should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_FAN_LOW), "fan_low should be inactive", __FILE__, (unsigned long)__LINE__);
    /* Expect transition fan_step_up fired */
}

/*
 * Case ID: SM-TC-TRANS-HEATER-OVERHEAT-FALSE
 * Name: Transition from Heater to Overheat blocked when condition is false
 * Model: state_machine
 * States: heater, overheat
 * Transitions: trip_overheat
 * Requirements: TEST-TRANS-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_heater_overheat_false(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = false;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_HEATER), "heater should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_OVERHEAT), "overheat should be inactive", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TRANS-HEATER-OVERHEAT-TRUE
 * Name: Transition from Heater to Overheat fires when condition is met
 * Model: state_machine
 * States: heater, overheat
 * Transitions: trip_overheat
 * Requirements: TEST-TRANS-001, TEST-TRANS-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_heater_overheat_true(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = true;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_OVERHEAT), "overheat should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertU32((uint32_t)0, (uint32_t)instance.data.duty_cmd, "duty_cmd value", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_HEATER), "heater should be inactive", __FILE__, (unsigned long)__LINE__);
    /* Expect transition trip_overheat fired */
}

/*
 * Case ID: SM-TC-TRANS-OVERHEAT-HEATER_HISTORY-FALSE
 * Name: Transition from Overheat to HEATER_HISTORY blocked when condition is false
 * Model: state_machine
 * States: overheat, heater_history
 * Transitions: resume_heater
 * Requirements: TEST-TRANS-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_overheat_heater_history_false(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = false;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_OVERHEAT), "overheat should be active", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TRANS-OVERHEAT-HEATER_HISTORY-TRUE
 * Name: Transition from Overheat to HEATER_HISTORY fires when condition is met
 * Model: state_machine
 * States: overheat, heater_history
 * Transitions: resume_heater
 * Requirements: TEST-TRANS-001, TEST-TRANS-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_overheat_heater_history_true(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = true;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_OVERHEAT), "overheat should be inactive", __FILE__, (unsigned long)__LINE__);
    /* Expect transition resume_heater fired */
}

/*
 * Case ID: SM-TC-TRANS-PWM_LOW-PWM_HIGH-FALSE
 * Name: Transition from PWM low to PWM high blocked when condition is false
 * Model: state_machine
 * States: pwm_low, pwm_high
 * Transitions: pwm_step_up
 * Requirements: TEST-TRANS-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_pwm_low_pwm_high_false(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = false;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_PWM_LOW), "pwm_low should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_PWM_HIGH), "pwm_high should be inactive", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TRANS-PWM_LOW-PWM_HIGH-TRUE
 * Name: Transition from PWM low to PWM high fires when condition is met
 * Model: state_machine
 * States: pwm_low, pwm_high
 * Transitions: pwm_step_up
 * Requirements: TEST-TRANS-001, TEST-TRANS-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_pwm_low_pwm_high_true(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = true;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_PWM_HIGH), "pwm_high should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_PWM_LOW), "pwm_low should be inactive", __FILE__, (unsigned long)__LINE__);
    /* Expect transition pwm_step_up fired */
}

/*
 * Case ID: SM-TC-TRANS-STANDBY-WARMING-FALSE
 * Name: Transition from Standby to Warming blocked when condition is false
 * Model: state_machine
 * States: standby, warming
 * Transitions: begin_warmup
 * Requirements: TEST-TRANS-003
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_standby_warming_false(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = false;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_STANDBY), "standby should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_WARMING), "warming should be inactive", __FILE__, (unsigned long)__LINE__);
}

/*
 * Case ID: SM-TC-TRANS-STANDBY-WARMING-TRUE
 * Name: Transition from Standby to Warming fires when condition is met
 * Model: state_machine
 * States: standby, warming
 * Transitions: begin_warmup
 * Requirements: TEST-TRANS-001, TEST-TRANS-002
 * Generated Functions: SM_Step
 */
static void test_sm_tc_trans_standby_warming_true(void)
{
    ADIA_Instance_t instance;
    MCAL_TestReset();

    (void)SM_Init(&instance);
    instance.data.x = true;
    (void)SM_Step(&instance, 10);
    (void)SM_Sync_IO(&instance);

    ADIA_AssertBool(true, SM_IsStateActive(&instance, SM_ST_WARMING), "warming should be active", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertU32((uint32_t)250, (uint32_t)instance.data.duty_cmd, "duty_cmd value", __FILE__, (unsigned long)__LINE__);
    ADIA_AssertBool(false, SM_IsStateActive(&instance, SM_ST_STANDBY), "standby should be inactive", __FILE__, (unsigned long)__LINE__);
    /* Expect transition begin_warmup fired */
    ADIA_AssertU32((uint32_t)0, (uint32_t)instance.data.heat_cycles, "heat_cycles value", __FILE__, (unsigned long)__LINE__);
}

static const ADIA_TestCase s_transitions_cases[] = {
    { "SM-TC-TRANS-FAN_LOW-FAN_HIGH-FALSE", "Transition from Fan low to Fan high blocked when condition is false", test_sm_tc_trans_fan_low_fan_high_false },
    { "SM-TC-TRANS-FAN_LOW-FAN_HIGH-TRUE", "Transition from Fan low to Fan high fires when condition is met", test_sm_tc_trans_fan_low_fan_high_true },
    { "SM-TC-TRANS-HEATER-OVERHEAT-FALSE", "Transition from Heater to Overheat blocked when condition is false", test_sm_tc_trans_heater_overheat_false },
    { "SM-TC-TRANS-HEATER-OVERHEAT-TRUE", "Transition from Heater to Overheat fires when condition is met", test_sm_tc_trans_heater_overheat_true },
    { "SM-TC-TRANS-OVERHEAT-HEATER_HISTORY-FALSE", "Transition from Overheat to HEATER_HISTORY blocked when condition is false", test_sm_tc_trans_overheat_heater_history_false },
    { "SM-TC-TRANS-OVERHEAT-HEATER_HISTORY-TRUE", "Transition from Overheat to HEATER_HISTORY fires when condition is met", test_sm_tc_trans_overheat_heater_history_true },
    { "SM-TC-TRANS-PWM_LOW-PWM_HIGH-FALSE", "Transition from PWM low to PWM high blocked when condition is false", test_sm_tc_trans_pwm_low_pwm_high_false },
    { "SM-TC-TRANS-PWM_LOW-PWM_HIGH-TRUE", "Transition from PWM low to PWM high fires when condition is met", test_sm_tc_trans_pwm_low_pwm_high_true },
    { "SM-TC-TRANS-STANDBY-WARMING-FALSE", "Transition from Standby to Warming blocked when condition is false", test_sm_tc_trans_standby_warming_false },
    { "SM-TC-TRANS-STANDBY-WARMING-TRUE", "Transition from Standby to Warming fires when condition is met", test_sm_tc_trans_standby_warming_true },
};

int run_suite_transitions(void)
{
    return ADIA_TestRun(s_transitions_cases, sizeof(s_transitions_cases) / sizeof(s_transitions_cases[0]));
}
