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

static float override_val_ch_1 = 0.0f;
static bool override_active_ch_1 = false;
static float override_val_ch_2 = 0.0f;
static bool override_active_ch_2 = false;

void HIL_Sync_Inputs(ADIA_Instance_t* instance) {
    if (override_active_ch_1) {
        instance->data.x = override_val_ch_1;
    } else {
        instance->data.x = HAL_GPIO_Read(PIN_CH_1, "ch_1");
    }
    if (override_active_ch_2) {
        instance->data.y = override_val_ch_2;
    } else {
        instance->data.y = HAL_GPIO_Read(PIN_CH_2, "ch_2");
    }
}

void HIL_Sync_Outputs(ADIA_Instance_t* instance) {
#ifdef SM_SAFETY_ENABLED
    /* Run safety validation on state consistency before writing outputs */
    if (SM_Validate_State_Consistency(instance) != SM_ERR_NONE) {
        instance->error_status = SM_ERR_INVALID_STATE;
        return;
    }
#endif
    (void)instance;
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
            if (strcmp(name, "ch_1") == 0) {
                override_val_ch_1 = val;
                override_active_ch_1 = true;
            } else if (strcmp(name, "ch_1_release") == 0) {
                override_active_ch_1 = false;
            } else if (strcmp(name, "ch_2") == 0) {
                override_val_ch_2 = val;
                override_active_ch_2 = true;
            } else if (strcmp(name, "ch_2_release") == 0) {
                override_active_ch_2 = false;
            }
            else { /* MISRA 15.7 */ }
        }
    }
}

void HIL_SendTelemetry(ADIA_Instance_t* instance) {
    char buf[512];
    int len = 0;
    (void)instance;
    if ((len >= 0) && ((size_t)len < (sizeof(buf) - 32U))) {
        int remaining = (int)(sizeof(buf) - (size_t)len);
        int written = snprintf(buf + len, (size_t)remaining, "ch_1=%.4f;", (double)(instance->data.x));
        if (written > 0) { len += (written < remaining) ? written : (remaining - 1); }
    }
    if ((len >= 0) && ((size_t)len < (sizeof(buf) - 32U))) {
        int remaining = (int)(sizeof(buf) - (size_t)len);
        int written = snprintf(buf + len, (size_t)remaining, "ch_2=%.4f", (double)(instance->data.y));
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
