@echo off
powershell.exe -NoProfile -File "%~dp0Start-EIMS.ps1" %*
if errorlevel 1 (
  echo.
  echo EIMS could not start. Review the error above.
  pause
)
