; Custom NSIS steps included by electron-builder (nsis.include in forge.config.cjs).
; Runs elevated (perMachine installer).

!macro customInstall
  ; Optional USB drivers (ST-Link, CP210x, CH340) the release engineer placed under drivers/.
  ; forge.config.cjs only ships resources\drivers when at least one .inf exists.
  IfFileExists "$INSTDIR\resources\drivers\*.*" 0 adia_no_drivers
    DetailPrint "Installing USB drivers from resources\drivers ..."
    ; The NSIS stub is 32-bit: on 64-bit Windows System32 is redirected, so call pnputil through Sysnative.
    StrCpy $1 "$WINDIR\Sysnative\pnputil.exe"
    IfFileExists "$1" +2 0
      StrCpy $1 "$WINDIR\System32\pnputil.exe"
    nsExec::ExecToLog '"$1" /add-driver "$INSTDIR\resources\drivers\*.inf" /subdirs /install'
    Pop $0
    DetailPrint "pnputil exit code: $0 (non-zero is not fatal; Windows inbox drivers still cover Arduino Uno/Mega)"
  adia_no_drivers:
!macroend
