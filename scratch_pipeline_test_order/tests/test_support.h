/*
 * ADIA Generated Test Support Header
 * Standard: c11
 * Automatically derived from state machine semantic model.
 */
#ifndef ADIA_TEST_SUPPORT_H
#define ADIA_TEST_SUPPORT_H

/* ISO C99 / C11 standard types for ADIA verification */
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>


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
