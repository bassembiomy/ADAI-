#ifndef WIRE_H
#define WIRE_H
#include <stdint.h>
class TwoWire {
public:
    void begin() {}
    void beginTransmission(uint8_t addr) { (void)addr; }
    uint8_t endTransmission() { return 0; }
    uint8_t write(uint8_t val) { (void)val; return 1; }
    uint8_t requestFrom(uint8_t addr, uint8_t qty) { (void)addr; (void)qty; return qty; }
    int available() { return 0; }
    int read() { return -1; }
};
extern TwoWire Wire;
#endif
