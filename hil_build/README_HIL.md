# ADIA HIL Generated Project

## Entry Point
- **Arduino_Mega**: Use `main_hil.ino` as the firmware entry point.
  - Arduino framework expects `setup()` and `loop()` (already generated).

## HAL/BSP Integration
- The application layer is decoupled from the target MCU.
- Implement the hooks in `hal_drivers.c` only if the generated template does not match your board.
- Do **not** modify `sm_core.c`, `sm_user_logic.c`, or the state machine logic; only map the HAL functions.

## Build
This project is configured for PlatformIO (see `platformio.ini`). Open the folder in VS Code with the PlatformIO extension or run `pio run` to build and upload.
