#include "Arduino.h"
#if !defined(__AVR__) || !__has_include(<avr/io.h>)
uint8_t DDRA = 0, PORTA = 0, PINA = 0;
uint8_t DDRB = 0, PORTB = 0, PINB = 0;
uint8_t DDRC = 0, PORTC = 0, PINC = 0;
uint8_t DDRD = 0, PORTD = 0, PIND = 0;
uint8_t UBRR0H = 0, UBRR0L = 0, UCSR0B = 0, UCSR0C = 0, UCSR0A = 0, UDR0 = 0;
#endif
SerialImpl Serial;
