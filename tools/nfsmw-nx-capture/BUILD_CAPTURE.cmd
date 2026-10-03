@echo off
setlocal
set "INPUT=%~1"
set "OUTPUT=%~2"
if "%INPUT%"=="" (
  echo Usage: BUILD_CAPTURE.cmd "D:\nfsmw\marocto_capture\raw-draws.json" ["D:\Marocto-Racing-Data\Models\mw2005\bmwm3gtr\capture.json"]
  exit /b 2
)
if "%OUTPUT%"=="" set "OUTPUT=%~dp1capture.json"
where node >nul 2>nul || (
  echo Node.js was not found in PATH.
  exit /b 3
)
node "%~dp0mw-draw-capture-build.mjs" "%INPUT%" "%OUTPUT%" --auto-car
if errorlevel 1 exit /b %errorlevel%
echo.
echo Phase 8 real-cubemap capture built:
echo   %OUTPUT%
echo PNG textures and cubemap faces are next to capture.json in the textures folder.
echo Sampler roles, material parameters and complete 6-face environmentCube maps are embedded in capture.json.
endlocal