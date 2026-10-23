@echo off
title Aether Craft v4.0 - Pro 3D WebGL Minecraft Launcher
echo Dang khoi dong Aether Craft v4.0...
if not exist "node_modules" (
  echo Dang cai dat thu vien lan dau...
  call npm install
)
call npm start
