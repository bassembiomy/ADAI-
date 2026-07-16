/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Generic (Generic C / Linux Platform)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#include "hal_drivers.h"
#include "hil_interface.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>


/* Generic software simulations */
static int simulated_inputs[100] = {0};
static int simulated_outputs[100] = {0};
char rx_buffer[256];
int rx_index = 0;


void HAL_Drivers_Init(void) {
    printf("HIL: Generic System Initialized\n");
    printf("HIL: Serial link initialized at %d baud\n", 115200);

    /* Peripherals Initialization */
    printf("HIL: GPIO %s on Pin %s configured as %s\n", "ch_1", "PA1", "Out");
    printf("HIL: GPIO %s on Pin %s configured as %s\n", "ch_2", "PA0", "In");
}

bool HAL_GPIO_Read(const char* pin, const char* name) {
    (void)pin;
    if (strcmp(name, "ch_2") == 0) {
        return (simulated_inputs[atoi("PA0")] > 0);
    }
    else { /* MISRA 15.7 */ }
    return false;
}

void HAL_GPIO_Write(const char* pin, const char* name, bool value) {
    (void)pin;
    if (strcmp(name, "ch_1") == 0) {
        simulated_outputs[atoi("PA1")] = (value) ? 1 : 0;
        return;
    }
    else { /* MISRA 15.7 */ }
}

uint32_t HAL_ADC_Read(const char* pin, const char* name) {
    (void)pin;
    /* No channels */
    return 0;
}

void HAL_DAC_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    /* No channels */
}

void HAL_PWM_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    /* No channels */
}

void HIL_SendString(const char* str) {
    printf("%s", str);
    fflush(stdout);
}

void HIL_Receive_Poll(void) {
    /* Stub receive from stdin or simulated file descriptor */
  int c;
  while ((c = getchar()) != EOF && c != '\n') {
      if (rx_index < 255) {
          rx_buffer[rx_index++] = c;
      }
  }
  if (rx_index > 0) {
      rx_buffer[rx_index] = '\0';
      HIL_ProcessMessage(rx_buffer);
      rx_index = 0;
  }
}
