/*
 * ADIA Generated Test Support Implementation
 * Standard: c99
 */
#include "test_support.h"
#include <stdio.h>
#include <string.h>
#include <math.h>

static const char *s_current_case_id = "";
static bool s_current_case_failed = false;
static size_t s_total_passed = 0;
static size_t s_total_failed = 0;

void ADIA_TestBegin(const char *case_id)
{
    s_current_case_id = case_id;
    s_current_case_failed = false;
    printf("[ADIA_TEST] RUN: %s\n", case_id ? case_id : "UNKNOWN");
}

void ADIA_TestFail(const char *file, unsigned long line, const char *message)
{
    s_current_case_failed = true;
    fprintf(stderr, "[ADIA_TEST] FAIL: %s (%s:%lu: %s)\n",
            s_current_case_id,
            file ? file : "unknown",
            line,
            message ? message : "assertion failed");
}

void ADIA_AssertBool(bool expected, bool actual, const char *expr, const char *file, unsigned long line)
{
    if (expected != actual) {
        char buf[256];
        (void)snprintf(buf, sizeof(buf), "Expected %s to be %s, got %s",
                       expr ? expr : "expression",
                       expected ? "true" : "false",
                       actual ? "true" : "false");
        ADIA_TestFail(file, line, buf);
    }
}

void ADIA_AssertU32(uint32_t expected, uint32_t actual, const char *expr, const char *file, unsigned long line)
{
    if (expected != actual) {
        char buf[256];
        (void)snprintf(buf, sizeof(buf), "Expected %s == %lu, got %lu",
                       expr ? expr : "expression",
                       (unsigned long)expected,
                       (unsigned long)actual);
        ADIA_TestFail(file, line, buf);
    }
}

void ADIA_AssertDouble(double expected, double actual, double tolerance, const char *expr, const char *file, unsigned long line)
{
    double diff = fabs(expected - actual);
    if (diff > tolerance) {
        char buf[256];
        (void)snprintf(buf, sizeof(buf), "Expected %s == %f (+/-%f), got %f (diff: %f)",
                       expr ? expr : "expression",
                       expected,
                       tolerance,
                       actual,
                       diff);
        ADIA_TestFail(file, line, buf);
    }
}

int ADIA_TestRun(const ADIA_TestCase *cases, size_t count)
{
    size_t i;
    s_total_passed = 0;
    s_total_failed = 0;

    printf("[ADIA_TEST] Starting test suite with %lu test cases\n", (unsigned long)count);

    for (i = 0; i < count; i++) {
        ADIA_TestBegin(cases[i].case_id);
        if (cases[i].fn != NULL) {
            cases[i].fn();
        }
        if (s_current_case_failed) {
            s_total_failed++;
            printf("[ADIA_TEST] RESULT: %s FAIL\n", cases[i].case_id);
        } else {
            s_total_passed++;
            printf("[ADIA_TEST] RESULT: %s PASS\n", cases[i].case_id);
        }
    }

    printf("[ADIA_TEST] Summary: %lu passed, %lu failed, %lu total\n",
           (unsigned long)s_total_passed,
           (unsigned long)s_total_failed,
           (unsigned long)count);

    return (s_total_failed == 0) ? 0 : 1;
}
