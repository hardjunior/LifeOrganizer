@echo off
title LifeOrganizer
cd /d "D:\Projetos\LifeOrganizer"

:: 1. Inicia o servidor em segundo plano se ainda nao estiver rodando
netstat -ano | findstr 8088 >nul
if %ERRORLEVEL% neq 0 (
    echo Iniciando servidor LifeOrganizer...
    start /B python -m uvicorn server:app --app-dir D:\Projetos\LifeOrganizer --host 127.0.0.1 --port 8088
    timeout /t 2 /nobreak >nul
)

:: 2. Abre no Microsoft Edge em MODO APP (Janela nativa dedicada, sem barras de navegador)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="http://127.0.0.1:8088" --window-size=1360,860
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="http://127.0.0.1:8088" --window-size=1360,860
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="http://127.0.0.1:8088" --window-size=1360,860
) else (
    start "" "http://127.0.0.1:8088"
)
exit
