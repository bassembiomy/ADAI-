#ifndef SPI_H
#define SPI_H
#include <stdint.h>
class SPIImpl {
public:
    void begin() {}
    uint8_t transfer(uint8_t val) { return val; }
};
extern SPIImpl SPI;
#endif
