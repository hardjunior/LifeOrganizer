@echo off
title LifeOrganizer - Gestao Visual de Arquivos
echo ===================================================
echo       INICIANDO LIFE ORGANIZER (ESTILO GOOGLE FOTOS)
echo ===================================================
echo.
cd /d "D:\Projetos\LifeOrganizer"

echo Abrindo interface no navegador...
start "" "http://localhost:8088"

echo Iniciando servidor FastAPI na porta 8088...
python -m uvicorn server:app --host 127.0.0.1 --port 8088
pause
