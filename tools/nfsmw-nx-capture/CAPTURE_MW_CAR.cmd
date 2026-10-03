@echo off
setlocal
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=%CD%"
if not exist "%TARGET%" (
  echo Folder does not exist: %TARGET%
  exit /b 2
)
>"%TARGET%\marocto_capture.trigger" echo capture
echo.
echo Marocto capture trigger created:
echo   %TARGET%\marocto_capture.trigger
echo.
echo Keep NFSMW open on the car/garage screen for at least one more rendered frame.
echo The patched renderer will write:
echo   %TARGET%\marocto_capture\raw-draws.json
echo.
endlocal
