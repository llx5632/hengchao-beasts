@echo off
chcp 65001 >nul
title Publish Hengchao Game
cd /d "%~dp0"
node "%~dp0scripts\publish.mjs"
if errorlevel 1 (
  echo.
  echo Publish failed. See the message above.
)
echo.
pause
