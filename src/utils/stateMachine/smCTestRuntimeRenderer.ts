import type { SMCStandard } from './smModel';
import type { SemanticIOMapping } from './smSemanticModel';

export interface CTestRuntimeRenderOptions {
  standard: SMCStandard;
  mappings?: readonly SemanticIOMapping[];
  maxCalls?: number;
}

export interface GeneratedCTestFile {
  name: string;
  content: string;
}

const renderStandardHeaders = (standard: SMCStandard): string => {
  if (standard === 'c90') {
    return `/* ISO C90 compatibility definitions for ADIA verification */
#if defined(__STDC_VERSION__) && (__STDC_VERSION__ >= 199901L)
#include <stdbool.h>
#include <stdint.h>
#else
#ifndef __cplusplus
typedef unsigned char bool;
#define true 1
#define false 0
#endif
typedef unsigned char uint8_t;
typedef signed char int8_t;
typedef unsigned short uint16_t;
typedef signed short int16_t;
typedef unsigned long uint32_t;
typedef signed long int32_t;
#endif
#include <stddef.h>
`;
  }

  return `/* ISO C99 / C11 standard types for ADIA verification */
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
`;
};

export const renderCTestSupportHeader = (standard: SMCStandard): string => {
  return `/*
 * ADIA Generated Test Support Header
 * Standard: ${standard}
 * Automatically derived from state machine semantic model.
 */
#ifndef ADIA_TEST_SUPPORT_H
#define ADIA_TEST_SUPPORT_H

${renderStandardHeaders(standard)}

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*ADIA_TestFn)(void);

typedef struct {
    const char *case_id;
    const char *name;
    ADIA_TestFn fn;
} ADIA_TestCase;

void ADIA_TestBegin(const char *case_id);
void ADIA_TestFail(const char *file, unsigned long line, const char *message);
void ADIA_AssertBool(bool expected, bool actual, const char *expr, const char *file, unsigned long line);
void ADIA_AssertU32(uint32_t expected, uint32_t actual, const char *expr, const char *file, unsigned long line);
void ADIA_AssertDouble(double expected, double actual, double tolerance, const char *expr, const char *file, unsigned long line);
int ADIA_TestRun(const ADIA_TestCase *cases, size_t count);

#ifdef __cplusplus
}
#endif

#endif /* ADIA_TEST_SUPPORT_H */
`;
};

export const renderCTestSupportSource = (standard: SMCStandard): string => {
  return `/*
 * ADIA Generated Test Support Implementation
 * Standard: ${standard}
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
    printf("[ADIA_TEST] RUN: %s\\n", case_id ? case_id : "UNKNOWN");
}

void ADIA_TestFail(const char *file, unsigned long line, const char *message)
{
    s_current_case_failed = true;
    fprintf(stderr, "[ADIA_TEST] FAIL: %s (%s:%lu: %s)\\n",
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

    printf("[ADIA_TEST] Starting test suite with %lu test cases\\n", (unsigned long)count);

    for (i = 0; i < count; i++) {
        ADIA_TestBegin(cases[i].case_id);
        if (cases[i].fn != NULL) {
            cases[i].fn();
        }
        if (s_current_case_failed) {
            s_total_failed++;
            printf("[ADIA_TEST] RESULT: %s FAIL\\n", cases[i].case_id);
        } else {
            s_total_passed++;
            printf("[ADIA_TEST] RESULT: %s PASS\\n", cases[i].case_id);
        }
    }

    printf("[ADIA_TEST] Summary: %lu passed, %lu failed, %lu total\\n",
           (unsigned long)s_total_passed,
           (unsigned long)s_total_failed,
           (unsigned long)count);

    return (s_total_failed == 0) ? 0 : 1;
}
`;
};

export const renderMCALTestStubHeader = (standard: SMCStandard): string => {
  return `/*
 * ADIA Generated MCAL Test Stub Header
 * Standard: ${standard}
 */
#ifndef MCAL_TEST_STUB_H
#define MCAL_TEST_STUB_H

#include "test_support.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    MCAL_CALL_NONE = 0,
    MCAL_CALL_DIO_READ,
    MCAL_CALL_DIO_WRITE,
    MCAL_CALL_PWM_SET_DUTY,
    MCAL_CALL_ADC_READ,
    MCAL_CALL_WATCHDOG_SERVICE,
    MCAL_CALL_SAFE_OUTPUTS
} MCAL_CallKind;

typedef struct {
    MCAL_CallKind kind;
    const char *function_name;
    uint32_t channel;
    double value;
    uint32_t order;
} MCAL_TestCall;

void MCAL_TestReset(void);
size_t MCAL_TestCount(void);
const MCAL_TestCall *MCAL_TestCallAt(size_t index);
size_t MCAL_TestCountByKind(MCAL_CallKind kind);
size_t MCAL_TestCountByFunction(const char *function_name);

void MCAL_SetChannelInputBool(uint32_t channel, bool val);
void MCAL_SetChannelInputU32(uint32_t channel, uint32_t val);
void MCAL_SetChannelInputDouble(uint32_t channel, double val);

bool MCAL_GetChannelInputBool(uint32_t channel);
uint32_t MCAL_GetChannelInputU32(uint32_t channel);
double MCAL_GetChannelInputDouble(uint32_t channel);

/* Standard AUTOSAR/ADIA MCAL mock functions */
uint8_t Dio_ReadChannel(uint32_t channel);
void Dio_WriteChannel(uint32_t channel, uint8_t level);
void Wdg_Service(void);
void ADIA_Safe_Outputs_Hook(void);

#ifdef __cplusplus
}
#endif

#endif /* MCAL_TEST_STUB_H */
`;
};

export const renderMCALTestStubSource = (
  standard: SMCStandard,
  capacity = 64,
): string => {
  const cap = Math.max(64, capacity);
  return `/*
 * ADIA Generated MCAL Test Stub Implementation
 * Standard: ${standard}
 */
#include "mcal_test_stub.h"
#include <string.h>

#define MCAL_CALL_CAPACITY ${cap}
#define MCAL_CHANNEL_CAPACITY 64

static MCAL_TestCall s_calls[MCAL_CALL_CAPACITY];
static size_t s_call_count = 0;
static uint32_t s_call_order = 0;

static double s_channel_inputs[MCAL_CHANNEL_CAPACITY];
static bool s_channel_has_input[MCAL_CHANNEL_CAPACITY];

void MCAL_TestReset(void)
{
    size_t i;
    (void)memset(s_calls, 0, sizeof(s_calls));
    s_call_count = 0;
    s_call_order = 0;

    for (i = 0; i < MCAL_CHANNEL_CAPACITY; i++) {
        s_channel_inputs[i] = 0.0;
        s_channel_has_input[i] = false;
    }
}

size_t MCAL_TestCount(void)
{
    return s_call_count;
}

const MCAL_TestCall *MCAL_TestCallAt(size_t index)
{
    if (index >= s_call_count) {
        return NULL;
    }
    return &s_calls[index];
}

size_t MCAL_TestCountByKind(MCAL_CallKind kind)
{
    size_t i;
    size_t matching = 0;
    for (i = 0; i < s_call_count; i++) {
        if (s_calls[i].kind == kind) {
            matching++;
        }
    }
    return matching;
}

size_t MCAL_TestCountByFunction(const char *function_name)
{
    size_t i;
    size_t matching = 0;
    if (function_name == NULL) return 0;
    for (i = 0; i < s_call_count; i++) {
        if (s_calls[i].function_name != NULL && strcmp(s_calls[i].function_name, function_name) == 0) {
            matching++;
        }
    }
    return matching;
}

static void recordCall(MCAL_CallKind kind, const char *fn_name, uint32_t channel, double val)
{
    if (s_call_count >= (size_t)MCAL_CALL_CAPACITY) {
        ADIA_TestFail(__FILE__, (unsigned long)__LINE__, "MCAL recorder capacity exceeded");
        return;
    }
    s_calls[s_call_count].kind = kind;
    s_calls[s_call_count].function_name = fn_name;
    s_calls[s_call_count].channel = channel;
    s_calls[s_call_count].value = val;
    s_calls[s_call_count].order = s_call_order++;
    s_call_count++;
}

void MCAL_SetChannelInputBool(uint32_t channel, bool val)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY) {
        s_channel_inputs[channel] = val ? 1.0 : 0.0;
        s_channel_has_input[channel] = true;
    }
}

void MCAL_SetChannelInputU32(uint32_t channel, uint32_t val)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY) {
        s_channel_inputs[channel] = (double)val;
        s_channel_has_input[channel] = true;
    }
}

void MCAL_SetChannelInputDouble(uint32_t channel, double val)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY) {
        s_channel_inputs[channel] = val;
        s_channel_has_input[channel] = true;
    }
}

bool MCAL_GetChannelInputBool(uint32_t channel)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        return s_channel_inputs[channel] != 0.0;
    }
    return false;
}

uint32_t MCAL_GetChannelInputU32(uint32_t channel)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        return (uint32_t)s_channel_inputs[channel];
    }
    return 0;
}

double MCAL_GetChannelInputDouble(uint32_t channel)
{
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        return s_channel_inputs[channel];
    }
    return 0.0;
}

uint8_t Dio_ReadChannel(uint32_t channel)
{
    double val = 0.0;
    if (channel < (uint32_t)MCAL_CHANNEL_CAPACITY && s_channel_has_input[channel]) {
        val = s_channel_inputs[channel];
    }
    recordCall(MCAL_CALL_DIO_READ, "Dio_ReadChannel", channel, val);
    return (uint8_t)(val != 0.0 ? 1 : 0);
}

void Dio_WriteChannel(uint32_t channel, uint8_t level)
{
    recordCall(MCAL_CALL_DIO_WRITE, "Dio_WriteChannel", channel, (double)level);
}

void Wdg_Service(void)
{
    recordCall(MCAL_CALL_WATCHDOG_SERVICE, "Wdg_Service", 0, 1.0);
}

void ADIA_Safe_Outputs_Hook(void)
{
    recordCall(MCAL_CALL_SAFE_OUTPUTS, "ADIA_Safe_Outputs_Hook", 0, 1.0);
}
`;
};

export const renderCTestMainSource = (standard: SMCStandard): string => {
  return `/*
 * ADIA Generated Test Main Runner
 * Standard: ${standard}
 */
#include "test_support.h"

extern const ADIA_TestCase g_adia_test_cases[];
extern const size_t g_adia_test_case_count;

int main(void)
{
    return ADIA_TestRun(g_adia_test_cases, g_adia_test_case_count);
}
`;
};

export const renderCTestRuntimeFiles = (
  options: CTestRuntimeRenderOptions,
): readonly GeneratedCTestFile[] => {
  const standard = options.standard;
  const capacity = options.maxCalls ? Math.max(64, options.maxCalls + 8) : 64;

  return Object.freeze([
    {
      name: 'tests/test_support.h',
      content: renderCTestSupportHeader(standard),
    },
    {
      name: 'tests/test_support.c',
      content: renderCTestSupportSource(standard),
    },
    {
      name: 'tests/test_main.c',
      content: renderCTestMainSource(standard),
    },
    {
      name: 'tests/mcal_test_stub.h',
      content: renderMCALTestStubHeader(standard),
    },
    {
      name: 'tests/mcal_test_stub.c',
      content: renderMCALTestStubSource(standard, capacity),
    },
  ]);
};
