# HIL production build and installation

ADIA now builds the five MCU targets against real vendor frameworks rather than simulation headers:

| Target | Firmware driver/runtime | Generated flash files |
| --- | --- | --- |
| Arduino Uno / ATmega328P | Arduino AVR core | Intel HEX |
| Arduino Mega / ATmega2560 | Arduino AVR core | Intel HEX |
| STM32F103C8T6 | STM32Cube F1 HAL/CMSIS | ELF with startup/vector table and linker layout |
| STM32F407VGT6 | STM32Cube F4 HAL/CMSIS | ELF with startup/vector table and linker layout |
| ESP32-WROOM-32 | Espressif Arduino core / vendor SDK | Bootloader, partition table, OTA initializer and application BIN |

The supported production signal adapters are GPIO, ADC and PWM on all five targets, plus hardware DAC on STM32F407 and ESP32. Unsupported pins, reserved communication pins, invalid directions, and unsupported buffered buses/CAN/Timer adapters fail generation rather than becoming fake drivers. HIL UART communication is part of the runtime on every MCU. STM32 uses its internal HSI oscillator (F103 8 MHz, F407 16 MHz) to avoid assuming an external crystal.

## Preparing a release on Windows x64

```powershell
npm run provision:hil
npm run test:hil:bundle
npm run test:hil:build-matrix
npm run package
# To produce the installer:
npm run make
```

Provisioning is the network-enabled release preparation step. It installs portable Python, pinned PlatformIO platforms and their actual framework/compiler dependency closure under `toolchains/hil-runtime`. Python package versions are locked in `scripts/hil-runtime-requirements.txt`. The bundle inventory hashes all installed runtime files. Release verification rejects missing or modified framework/tool assets. Compiler, programmer executables, configuration files and target packs are included in Electron resources.

An installed application uses those packaged resources and writes generated source projects and build caches to writable user data. It does not download SDKs or depend on compilers/Python in the user's PATH. Each build stages the saved source snapshot in its own directory; source files and unrelated user modifications remain separate from generated compiler intermediates.

The five-target production matrix builds fresh projects with networking blocked, no test shims and an empty application cache. It exercises GPIO input/output, ADC, PWM, and the available DAC adapters. It retains logs and actual ELF/MAP/HEX/BIN hashes under the printed `.tmp/hil-production-matrix-*` evidence directory.

## Programming

Select the MCU and COM port, generate/save the project, and build it. Programming requires a current verified build with unchanged sources and flash-image hashes. AVR uses the pinned Uno/Mega bootloader protocol at 115200 baud independently of telemetry speed. STM32 uses bundled OpenOCD with ST-Link; unsupported programmer selections are rejected. ESP32 writes all four required images at their board-defined addresses. Programmer configuration self-checks never initialize a probe or write hardware.

Actual programming, boot, serial communication and electrical peripheral behavior must be verified with the corresponding connected boards. Compilation and flasher configuration checks do not establish physical hardware operation. Board-specific USB drivers and wiring must match the actual attached hardware.

## Evidence rules

Only real tool output establishes linked MCU readiness. Missing size tools, malformed measurements, wrong binary architecture, absent link maps, missing flash images or changed sources block programming. Simulation shims always produce a blocked manifest. Generic is a host simulation target and must never be treated as flashable MCU firmware.

## Verified on 7 October 2026

- Five generated MCU projects built offline using only the packaged vendor resources and a fresh writable cache: `.tmp/hil-production-matrix-uizeTg/results.json`.
- 25 HIL/target/component test files passed, with 128 tests; the final HIL UI rerun passed all seven tests.
- The security suite, Generic host compiler check, TypeScript checks and production UI/Electron builds passed.
- Windows x64 packaging includes the complete hashed vendor runtime, target packs and programmer assets; post-package verification checks the bundle and all five flasher configurations.
- Windows builds use a validated local SDK directory junction to avoid older Xtensa GCC's command-line length limit after installation. No SDK downloads or global compiler installation are needed at build time.

The runnable package is `out/ADIA-win32-x64/ADIA.exe`. An installer is produced separately with `npm run make`. Physical board programming remains unverified.
