#ifndef MyArduino_h
#define MyArduino_h

#include <stdint.h>
#include <string.h>
#include <stdlib.h>

#if defined(__AVR__) && __has_include(<avr/io.h>)
#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#else
// Desktop linter stubs so the editor shows no errors
#define _delay_ms(x)
#define sei()
extern uint8_t DDRA, PORTA, PINA;
extern uint8_t DDRB, PORTB, PINB;
extern uint8_t DDRC, PORTC, PINC;
extern uint8_t DDRD, PORTD, PIND;
#define RXEN0 0
#define TXEN0 0
#define UCSZ00 0
#define RXC0 0
#define UDRE0 0
extern uint8_t UBRR0H, UBRR0L, UCSR0B, UCSR0C, UCSR0A, UDR0;
#define PA0 0
#define PA1 1
#define PA2 2
#define PA3 3
#define PA4 4
#define PA5 5
#define PA6 6
#define PA7 7
#define PB0 0
#define PB1 1
#define PB2 2
#define PB3 3
#define PB4 4
#define PB5 5
#define PB6 6
#define PB7 7
#define PC0 0
#define PC1 1
#define PC2 2
#define PC3 3
#define PC4 4
#define PC5 5
#define PC6 6
#define PC7 7
#define PD0 0
#define PD1 1
#define PD2 2
#define PD3 3
#define PD4 4
#define PD5 5
#define PD6 6
#define PD7 7
#define PE0 0
#define PE1 1
#define PE2 2
#define PE3 3
#define PE4 4
#define PE5 5
#define PE6 6
#define PE7 7
#define PF0 0
#define PF1 1
#define PF2 2
#define PF3 3
#define PF4 4
#define PF5 5
#define PF6 6
#define PF7 7
#define PG0 0
#define PG1 1
#define PG2 2
#define PG3 3
#define PG4 4
#define PG5 5
#define PG6 6
#define PG7 7
#define PH0 0
#define PH1 1
#define PH2 2
#define PH3 3
#define PH4 4
#define PH5 5
#define PH6 6
#define PH7 7
#define PJ0 0
#define PJ1 1
#define PJ2 2
#define PJ3 3
#define PJ4 4
#define PJ5 5
#define PJ6 6
#define PJ7 7
#define PK0 0
#define PK1 1
#define PK2 2
#define PK3 3
#define PK4 4
#define PK5 5
#define PK6 6
#define PK7 7
#define PL0 0
#define PL1 1
#define PL2 2
#define PL3 3
#define PL4 4
#define PL5 5
#define PL6 6
#define PL7 7
#endif

#define INPUT 0
#define OUTPUT 1
#define HIGH 1
#define LOW 0

inline void delay(uint32_t ms) {
    while (ms--) {
        _delay_ms(1);
    }
}

inline void init() {
    sei();
}

typedef struct PinInfo {
    volatile uint8_t* ddr;
    volatile uint8_t* port;
    volatile uint8_t* pinReg;
    uint8_t mask;
} PinInfo;

inline PinInfo getPinInfo(int pin) {
    PinInfo info = { 0, 0, 0, 0 };
#if defined(__AVR_ATmega2560__) || defined(__AVR_ATmega1280__)
    if (pin >= 22 && pin <= 29) {
        info.ddr = &DDRA;
        info.port = &PORTA;
        info.pinReg = &PINA;
        info.mask = 1 << (pin - 22);
    } else if (pin >= 37 && pin <= 30) {
        info.ddr = &DDRC;
        info.port = &PORTC;
        info.pinReg = &PINC;
        info.mask = 1 << (37 - pin);
    } else if (pin >= 50 && pin <= 53) {
        info.ddr = &DDRB;
        info.port = &PORTB;
        info.pinReg = &PINB;
        info.mask = 1 << (53 - pin);
    } else if (pin == 13) {
        info.ddr = &DDRB;
        info.port = &PORTB;
        info.pinReg = &PINB;
        info.mask = 1 << 7;
    } else {
        if (pin >= 0 && pin <= 7) {
            info.ddr = &DDRA;
            info.port = &PORTA;
            info.pinReg = &PINA;
            info.mask = 1 << pin;
        } else {
            info.ddr = &DDRB;
            info.port = &PORTB;
            info.pinReg = &PINB;
            info.mask = 1 << (pin - 8);
        }
    }
#else
    if (pin >= 0 && pin <= 7) {
        info.ddr = &DDRD;
        info.port = &PORTD;
        info.pinReg = &PIND;
        info.mask = 1 << pin;
    } else if (pin >= 8 && pin <= 13) {
        info.ddr = &DDRB;
        info.port = &PORTB;
        info.pinReg = &PINB;
        info.mask = 1 << (pin - 8);
    } else if (pin >= 14 && pin <= 19) {
        info.ddr = &DDRC;
        info.port = &PORTC;
        info.pinReg = &PINC;
        info.mask = 1 << (pin - 14);
    }
#endif
    return info;
}

inline void pinMode(int pin, int mode) {
    PinInfo info = getPinInfo(pin);
    if (info.ddr) {
        if (mode == OUTPUT) {
            *(info.ddr) |= info.mask;
        } else {
            *(info.ddr) &= ~info.mask;
        }
    }
}

inline int digitalRead(int pin) {
    PinInfo info = getPinInfo(pin);
    if (info.pinReg) {
        return (*(info.pinReg) & info.mask) ? HIGH : LOW;
    }
    return LOW;
}

inline void digitalWrite(int pin, int val) {
    PinInfo info = getPinInfo(pin);
    if (info.port) {
        if (val == HIGH) {
            *(info.port) |= info.mask;
        } else {
            *(info.port) &= ~info.mask;
        }
    }
}

inline int analogRead(int pin) {
    (void)pin;
    return 0;
}

inline void analogWrite(int pin, int val) {
    (void)pin;
    (void)val;
}

#ifdef __cplusplus
class String {
private:
    char* data;
    int len;
public:
    String() {
        data = (char*)malloc(1);
        data[0] = '\0';
        len = 0;
    }
    String(const char* str) {
        len = strlen(str);
        data = (char*)malloc(len + 1);
        strcpy(data, str);
    }
    String(const String& other) {
        len = other.len;
        data = (char*)malloc(len + 1);
        strcpy(data, other.data);
    }
    ~String() {
        free(data);
    }
    const char* c_str() const {
        return data;
    }
    String& operator=(const char* str) {
        free(data);
        len = strlen(str);
        data = (char*)malloc(len + 1);
        strcpy(data, str);
        return *this;
    }
    String& operator+=(char c) {
        data = (char*)realloc(data, len + 2);
        data[len] = c;
        data[len + 1] = '\0';
        len++;
        return *this;
    }
};

class SerialImpl {
public:
    void begin(unsigned long baud) {
        uint16_t ubrr = (uint16_t)(16000000UL / (16UL * baud) - 1);
        UBRR0H = (uint8_t)(ubrr >> 8);
        UBRR0L = (uint8_t)ubrr;
        UCSR0B = (1 << RXEN0) | (1 << TXEN0);
        UCSR0C = (3 << UCSZ00);
    }
    int available() {
        return (UCSR0A & (1 << RXC0)) ? 1 : 0;
    }
    char read() {
        return UDR0;
    }
    void print(const char* str) {
        while (*str) {
            while (!(UCSR0A & (1 << UDRE0)));
            UDR0 = *str++;
        }
    }
};

extern SerialImpl Serial;
#endif

#endif