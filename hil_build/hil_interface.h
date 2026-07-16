/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Generic (Generic C / Linux Platform)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#ifndef HIL_INTERFACE_H
#define HIL_INTERFACE_H

#include "sm_config.h"

void HIL_Sync_Inputs(ADIA_Instance_t* instance);
void HIL_Sync_Outputs(ADIA_Instance_t* instance);
void HIL_ProcessMessage(const char* msg);
void HIL_SendTelemetry(ADIA_Instance_t* instance);

#endif /* HIL_INTERFACE_H */