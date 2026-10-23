@echo off
title Aether Craft v3.0 - Minecraft Multi-Core Launcher
cd /d "%~dp0"
if not exist "node_modules" (
  echo Dang cai dat thu vien lan dau...
  call npm install
)
start "" npx electron .
