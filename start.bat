@echo off
start http://localhost:5173
wsl -e bash -ic "cd \"$(wslpath '%~dp0')\" && npm run dev"
