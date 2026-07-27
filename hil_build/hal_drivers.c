/* ============================================================= */
/*  ADIA HIL (Hardware-in-the-Loop) - AUTO GENERATED CODE       */
/*  Target MCU: Arduino_Mega (Arduino Mega)                          */
/*  Baud Rate: 115200                                */
/*  Do not modify this file manually                             */
/* ============================================================= */

#include "hal_drivers.h"
#include "hal_config.h"
#include "hil_interface.h"
#include "Arduino.h"
#include <Wire.h>


/* HIL Buffer */
#define RX_BUF_SIZE 128
char rx_buffer[RX_BUF_SIZE];
uint8_t rx_index = 0;

#include <SPI.h>

#ifdef __cplusplus
static inline uint32_t HAL_UART_ReadChannel(void) {
    return Serial1.available() ? (uint32_t)Serial1.read() : 0U;
}
static inline void HAL_UART_WriteChannel(uint32_t val) {
    Serial1.write((uint8_t)val);
}
static inline uint32_t HAL_SPI_ReadChannel(int csPin) {
    digitalWrite(csPin, LOW);
    uint32_t val = SPI.transfer(0x00);
    digitalWrite(csPin, HIGH);
    return val;
}
static inline void HAL_SPI_WriteChannel(int csPin, uint32_t val) {
    digitalWrite(csPin, LOW);
    SPI.transfer((uint8_t)val);
    digitalWrite(csPin, HIGH);
}
#endif


void HAL_Drivers_Init(void) {
    init();
    Serial.begin(HIL_BAUDRATE);

    /* Peripherals Initialization */
    pinMode(PA0, INPUT);
    pinMode(PA1, INPUT);
}

bool HAL_GPIO_Read(const char* pin, const char* name) {
    (void)pin;
    if (strcmp(name, "ch_1") == 0) {
        return digitalRead(PA0) == HIGH;
    }
    if (strcmp(name, "ch_2") == 0) {
        return digitalRead(PA1) == HIGH;
    }
    else { /* MISRA 15.7 */ }
    return false;
}

void HAL_GPIO_Write(const char* pin, const char* name, bool value) {
    (void)pin;
    /* No channels */
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

uint32_t HAL_UART_Read(const char* pin, const char* name) {
    (void)pin;
    /* No channels */
    return 0;
}

void HAL_UART_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    /* No channels */
}

uint32_t HAL_SPI_Read(const char* pin, const char* name) {
    (void)pin;
    /* No channels */
    return 0;
}

void HAL_SPI_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    /* No channels */
}

uint32_t HAL_I2C_Read(const char* pin, const char* name) {
    (void)pin;
    /* No channels */
    return 0;
}

void HAL_I2C_Write(const char* pin, const char* name, uint32_t value) {
    (void)pin;
    /* No channels */
}

void HIL_SendString(const char* str) {
    Serial.print(str);
}

void HIL_Receive_Poll(void) {
    while (Serial.available() > 0) {
      char c = Serial.read();
      if (rx_index < RX_BUF_SIZE - 1) {
          if (c == '\n') {
              rx_buffer[rx_index] = '\0';
              HIL_ProcessMessage(rx_buffer);
              rx_index = 0;
          } else {
              rx_buffer[rx_index++] = c;
          }
      } else {
          rx_index = 0;
      }
  }
}
