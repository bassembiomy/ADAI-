/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Arduino_Mega (Arduino Mega)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#include "hil_interface.h"
#include "hal_config.h"
#include "hal_drivers.h"
#ifdef SM_SAFETY_ENABLED
#include "sm_safety.h"
#endif
#include "sm_core.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>



void HIL_Sync_Inputs(ADIA_Instance_t* instance) {
    (void)instance;
}

void HIL_Sync_Outputs(ADIA_Instance_t* instance) {
#ifdef SM_SAFETY_ENABLED
    /* Run safety validation on state consistency before writing outputs */
    if (SM_Validate_State_Consistency(instance) != SM_ERR_NONE) {
        instance->error_status = SM_ERR_INVALID_STATE;
        HAL_GPIO_Write(PIN_CH_1, "ch_1", 0);
        return;
    }
#endif
    HAL_GPIO_Write(PIN_CH_1, "ch_1", instance->data.x);
}

void HIL_ProcessMessage(const char* msg) {
    char temp[256];
    strncpy(temp, msg, sizeof(temp));
    temp[sizeof(temp)-1] = '\0';
    
    char* p = temp;
    while (*p != '\0') {
        char* token = p;
        while (*p != '\0' && *p != ';') {
            p++;
        }
        if (*p == ';') {
            *p = '\0';
            p++;
        }
        
        char name[64];
        float val = 0.0f;
        if (sscanf(token, "%63[^=]=%f", name, &val) == 2) {
            /* No input channels */
        }
    }
}

void HIL_SendTelemetry(ADIA_Instance_t* instance) {
    char buf[512];
    int len = 0;
    (void)instance;
    if ((len >= 0) && ((size_t)len < (sizeof(buf) - 32U))) {
        int remaining = (int)(sizeof(buf) - (size_t)len);
        int written = snprintf(buf + len, (size_t)remaining, "ch_1=%.4f", (double)(instance->data.x));
        if (written > 0) { len += (written < remaining) ? written : (remaining - 1); }
    }
    
    if (SM_GetError(instance) != SM_ERR_NONE) {
        if ((len >= 0) && ((size_t)len < (sizeof(buf) - 32U))) {
            int remaining = (int)(sizeof(buf) - (size_t)len);
            int written = snprintf(buf + len, (size_t)remaining, ";ERROR=%d", (int)SM_GetError(instance));
            if (written > 0) { len += (written < remaining) ? written : (remaining - 1); }
        }
    }

    if ((len >= 0) && ((size_t)len < (sizeof(buf) - 2U))) {
        (void)snprintf(buf + len, sizeof(buf) - (size_t)len, "\n");
    }
    HIL_SendString(buf);
}
