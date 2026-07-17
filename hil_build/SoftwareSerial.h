#ifndef SoftwareSerial_H
#define SoftwareSerial_H
#include <stdint.h>
class SoftwareSerial {
public:
    SoftwareSerial(int rx, int tx) { (void)rx; (void)tx; }
    void begin(long speed) { (void)speed; }
    int available() { return 0; }
    int read() { return -1; }
    void write(uint8_t val) { (void)val; }
};
#endif
