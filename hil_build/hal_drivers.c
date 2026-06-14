/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Arduino_Mega (Arduino Mega)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#include "hal_drivers.h"
#include "hil_interface.h"
#include "Arduino.h"


String rx_buffer = "";


void HAL_Drivers_Init(void) {
    init();
    Serial.begin(115200);

    /* Peripherals Initialization */
    pinMode(PA0, INPUT);
}

bool HAL_GPIO_Read(const char* pin, const char* name) {
    (void)pin;
    if (strcmp(name, "ch_1") == 0) {
        return digitalRead(PA0) == HIGH;
    }
    return false;
}

void HAL_GPIO_Write(const char* pin, const char* name, bool value) {
    (void)pin;
    
}

uint32_t HAL_ADC_Read(const char* pin, const char* name) {
    (void)pin;
    
    return 0;
}

void HAL_DAC_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    
}

void HAL_PWM_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    
}

void HIL_SendString(const char* str) {
    Serial.print(str);
}

void HIL_Receive_Poll(void) {
    while (Serial.available() > 0) {
      char c = Serial.read();
      if (c == '\n') {
          HIL_ProcessMessage(rx_buffer.c_str());
          rx_buffer = "";
      } else {
          rx_buffer += c;
      }
  }
}
