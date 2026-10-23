@echo off
title Aether Client v2.0 - Minecraft Launcher (Crack + Ban Quyen)
cd /d "%~dp0"
if not exist "node_modules" (
  echo Dang cai dat thu vien lan dau...
  call npm install
)
start "" npx electron .
