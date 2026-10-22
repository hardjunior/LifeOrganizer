@echo off
setlocal
cd /d "D:\Projetos\LifeOrganizer"
python "D:\Projetos\LifeOrganizer\run_daily.py"
exit /b %ERRORLEVEL%
