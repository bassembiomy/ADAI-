# Optional USB drivers

This directory is an **optional** payload for the Windows installer. Nothing in it is downloaded or committed by
this repository: every file here except this README is git-ignored.

If `drivers/` contains at least one `.inf` file (top level or in sub-folders) when `npm run make` runs,
`forge.config.cjs` ships the folder as `resources/drivers`, and the NSIS installer (`installer/installer.nsh`)
runs, elevated:

```
pnputil /add-driver "<install dir>\resources\drivers\*.inf" /subdirs /install
```

A non-zero `pnputil` exit code is logged but does not abort the installation.

## Which drivers

| Hardware | Driver | Needed? |
| --- | --- | --- |
| ST-Link V2/V3 (STM32 Nucleo / Discovery, programming via OpenOCD) | STMicroelectronics ST-Link USB driver (`stsw-link009`, includes the WinUSB `.inf`/`.cat` files) | Windows 10/11 usually fetches it from Windows Update; ship it for air-gapped machines. |
| CP210x USB-to-UART (many clone boards, ESP32 dev boards) | Silicon Labs CP210x Universal Windows Driver | Optional. |
| CH340 / CH341 USB-to-serial (Arduino clones) | WCH CH341SER driver | Optional. |
| Arduino Uno / Mega (ATmega16U2) | Inbox `usbser` driver | Already part of Windows 10/11, nothing to ship. |

## Release engineer checklist

1. Download each driver package **from the vendor's own site**.
2. Read the vendor's licence and confirm that redistribution inside a third-party installer is permitted.
   If it is not, do not place the files here; document the manual install step instead.
3. Extract the package so the `.inf`, `.cat` and binaries sit under `drivers/<vendor>/`.
4. Record the vendor, driver version, download URL and licence decision in the release notes.
5. Run `npm run make` and verify on a clean VM that the device enumerates without internet access.
