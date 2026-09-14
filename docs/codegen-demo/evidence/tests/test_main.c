/*
 * ADIA Generated Test Main Runner
 * Standard: c99
 */
#include "test_support.h"

int run_suite_initialization(void);
int run_suite_transitions(void);
int run_suite_actions(void);
int run_suite_timing(void);
int run_suite_safety(void);
int run_suite_io(void);
int run_suite_reset(void);
int run_suite_robustness(void);
int run_suite_hierarchy(void);

int main(void)
{
    int failures = 0;
    failures += run_suite_initialization();
    failures += run_suite_transitions();
    failures += run_suite_actions();
    failures += run_suite_timing();
    failures += run_suite_safety();
    failures += run_suite_io();
    failures += run_suite_reset();
    failures += run_suite_robustness();
    failures += run_suite_hierarchy();
    return (failures == 0) ? 0 : 1;
}
