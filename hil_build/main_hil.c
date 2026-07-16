/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Generic (Generic C / Linux Platform)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#include "sm_core.h"
#include "hal_drivers.h"
#include "hil_interface.h"

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

ADIA_Instance_t sm_instance;

int main(void) {
    /* Initialize peripherals and UART */
    HAL_Drivers_Init();

    /* Initialize State Machine */
    SM_Init(&sm_instance);

    /* Main Execution Loop */
    while (1) {
        /* Check for override inputs from dashboard */
        HIL_Receive_Poll();

        /* Synchronize hardware inputs to State Machine */
        HIL_Sync_Inputs(&sm_instance);

        /* Tick the State Machine */
        SM_Step(&sm_instance, SM_TICK_MS);

        /* Synchronize State Machine outputs to hardware */
        HIL_Sync_Outputs(&sm_instance);

        /* Send back telemetry */
        HIL_SendTelemetry(&sm_instance);

        /* Sleep/Delay */
        /* Sleep for 10ms simulation tick */
#ifdef _WIN32
    Sleep(10);
#else
    usleep(10000);
#endif
    }
    return 0;
}
