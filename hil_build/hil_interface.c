/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Generic (Generic C / Linux Platform)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#include "hil_interface.h"
#include "hal_drivers.h"
#include "sm_safety.h"
#include "sm_core.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

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
            if (strcmp(name, "ch_2") == 0) {
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
    if (len < (int)(sizeof(buf) - 32U)) {
        len += snprintf(buf + len, sizeof(buf) - (size_t)len, "ch_1=%.4f;", (double)(instance->data.x));
    }
    if (len < (int)(sizeof(buf) - 32U)) {
        len += snprintf(buf + len, sizeof(buf) - (size_t)len, "ch_2=%.4f", (double)(instance->data.y));
    }
    
    if (SM_GetError(instance) != SM_ERR_NONE) {
        len += snprintf(buf + len, sizeof(buf) - (size_t)len, ";ERROR=%d", (int)SM_GetError(instance));
    }
    
    (void)snprintf(buf + len, sizeof(buf) - (size_t)len, "\n");
    HIL_SendString(buf);
}
