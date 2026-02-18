@echo off
start http://localhost:5173
wsl -e bash -ic "cd ~/projects/habitica-extension && npm run dev"
