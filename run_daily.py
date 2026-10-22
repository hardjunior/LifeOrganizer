"""
LifeOrganizer - Script de Execução Diária Autônoma (Cron / Windows Task)
Projetado para rodar silenciosamente todos os dias em segundo plano.
"""
import sys
import os
from datetime import datetime
from pathlib import Path

# Adiciona o diretório do LifeOrganizer ao sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from config import LOGS_DIR
from db import init_db, set_setting, get_setting, log_action
from scanner import scan_system
from organizer import auto_organize_root_files, clean_temp_files

def log_print(log_file_handle, message):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{timestamp}] {message}\n"
    print(line, end="")
    log_file_handle.write(line)
    log_file_handle.flush()

def run_daily_maintenance():
    log_file = LOGS_DIR / "daily_run.log"
    
    with open(log_file, "a", encoding="utf-8") as log:
        log.write(f"\n=======================================================\n")
        log_print(log, "INICIANDO ROTINA DIÁRIA DO LIFE ORGANIZER")
        log.write(f"=======================================================\n")
        log.flush()
        
        try:
            init_db()
            
            # 1. Escaneamento e atualização da árvore de arquivos
            log_print(log, "1. Escaneando arquivos e pastas...")
            scan_res = scan_system()
            if scan_res.get("success"):
                log_print(log, f"   -> Escaneamento finalizado: {scan_res['files_scanned']} arquivos, {scan_res['folders_scanned']} pastas.")
            else:
                log_print(log, f"   -> Erro no escaneamento: {scan_res.get('error')}")
                
            # 2. Verificação de limpeza de temporários
            auto_clean = get_setting("auto_clean_temp", "true") == "true"
            if auto_clean:
                log_print(log, "2. Limpeza de arquivos temporários antigos...")
                clean_res = clean_temp_files(dry_run=False, max_age_days=14)
                log_print(log, f"   -> Temporários enviados para Lixeira: {clean_res['cleaned_count']}")
            else:
                log_print(log, "2. Limpeza de temporários desativada nas configurações.")
                
            # 3. Verificação de auto-organização da raiz
            auto_organize = get_setting("auto_organize_root", "false") == "true"
            if auto_organize:
                log_print(log, "3. Auto-organizando arquivos soltos da raiz D:\\...")
                org_res = auto_organize_root_files(dry_run=False)
                log_print(log, f"   -> Arquivos organizados automaticamente: {org_res['organized_count']}")
            else:
                log_print(log, "3. Auto-organização da raiz mantida em modo manual/notificação.")
                
            # Registra timestamp
            now_iso = datetime.now().isoformat()
            set_setting("last_cron_run", now_iso)
            log_action("cron_daily_run", "system", "", "success", "Execução autônoma diária concluída.")
            log_print(log, "Rotina diária concluída com êxito!")
            
        except Exception as e:
            log_print(log, f"ERRO FATAL NA EXECUÇÃO: {str(e)}")
            log_action("cron_daily_run", "system", "", "error", str(e))

if __name__ == "__main__":
    run_daily_maintenance()
