/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Arduino_Mega (Arduino Mega)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#include "hil_interface.h"
#include "hal_drivers.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static float override_val_ch_1 = 0.0f;
static bool override_active_ch_1 = false;

void HIL_Sync_Inputs(ADIA_Instance_t* instance) {
    if (override_active_ch_1) {
        instance->data.value = override_val_ch_1;
    } else {
        instance->data.value = HAL_GPIO_Read(PIN_CH_1, "ch_1");
    }
    if (override_active_ch_1) {
        instance->data.flag = override_val_ch_1;
    } else {
        instance->data.flag = HAL_GPIO_Read(PIN_CH_1, "ch_1");
    }
}

void HIL_Sync_Outputs(ADIA_Instance_t* instance) {
    (void)instance;
}

void HIL_ProcessMessage(const char* msg) {
    char temp[256];
    strncpy(temp, msg, sizeof(temp));
    temp[sizeof(temp)-1] = '\0';
    char* token = strtok(temp, ";");
    while (token != NULL) {
        char name[64];
        float val;
        if (sscanf(token, "%63[^=]=%f", name, &val) == 2) {
            if (strcmp(name, "ch_1") == 0) {
                override_val_ch_1 = val;
                override_active_ch_1 = true;
            } else if (strcmp(name, "ch_1_release") == 0) {
                override_active_ch_1 = false;
            }
        }
        token = strtok(NULL, ";");
    }
}

void HIL_SendTelemetry(ADIA_Instance_t* instance) {
    char buf[512];
    int len = 0;
    (void)instance;
    len += sprintf(buf + len, "ch_1=%.4f", (double)(instance->data.value));
    sprintf(buf + len, "\n");
    HIL_SendString(buf);
}
