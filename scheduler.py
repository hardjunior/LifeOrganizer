"""
LifeOrganizer - Gerenciador do Agendador de Tarefas Diário (Cron do Windows e Linux/WSL)
"""
import subprocess
import shutil
import sys
from pathlib import Path
from db import set_setting, get_setting

BASE_DIR = Path(__file__).resolve().parent
TASK_NAME = "LifeOrganizerDaily"
BATCH_PATH = BASE_DIR / "run_daily.bat"
PYTHON_SCRIPT = BASE_DIR / "run_daily.py"

def get_task_status() -> dict:
    """Verifica se a tarefa diária está configurada no Agendador do Windows."""
    try:
        cmd = ["schtasks", "/Query", "/TN", TASK_NAME, "/FO", "LIST", "/V"]
        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        
        if proc.returncode != 0:
            return {
                "installed": False,
                "task_name": TASK_NAME,
                "status": "Não agendado",
                "next_run": "Nenhum",
                "last_run": get_setting("last_cron_run", "Nunca"),
                "scheduled_time": get_setting("daily_cron_time", "03:00")
            }
            
        output = proc.stdout
        next_run = "Desconhecido"
        last_run = "Desconhecido"
        status = "Ativo"
        
        for line in output.splitlines():
            line_str = line.strip()
            if "Próximo horário de execução:" in line_str or "Next Run Time:" in line_str:
                next_run = line_str.split(":", 1)[1].strip()
            elif "Último horário de execução:" in line_str or "Last Run Time:" in line_str:
                last_run = line_str.split(":", 1)[1].strip()
            elif "Status:" in line_str:
                status = line_str.split(":", 1)[1].strip()
                
        return {
            "installed": True,
            "task_name": TASK_NAME,
            "status": status or "Ativo",
            "next_run": next_run,
            "last_run": last_run,
            "scheduled_time": get_setting("daily_cron_time", "03:00")
        }
    except Exception as e:
        return {
            "installed": False,
            "error": str(e),
            "scheduled_time": get_setting("daily_cron_time", "03:00")
        }

def install_task(time_str: str = "03:00") -> dict:
    """
    Cria ou atualiza a tarefa no Agendador do Windows para executar diariamente no horário especificado.
    Ex: '03:00', '08:30'.
    """
    try:
        # Garante que o batch existe
        if not BATCH_PATH.exists():
            return {"success": False, "error": f"Arquivo {BATCH_PATH} não encontrado."}
            
        # Comando schtasks
        tr_command = f'cmd.exe /c "{BATCH_PATH}"'
        cmd = [
            "schtasks", "/Create",
            "/SC", "DAILY",
            "/TN", TASK_NAME,
            "/TR", tr_command,
            "/ST", time_str,
            "/F"
        ]
        
        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        if proc.returncode == 0:
            set_setting("daily_cron_time", time_str)
            return {"success": True, "message": f"Tarefa diária agendada com sucesso para às {time_str} todos os dias!"}
        else:
            return {"success": False, "error": proc.stderr or proc.stdout}
    except Exception as e:
        return {"success": False, "error": str(e)}

def uninstall_task() -> dict:
    """Remove a tarefa do Agendador do Windows."""
    try:
        cmd = ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"]
        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        if proc.returncode == 0:
            return {"success": True, "message": "Agendamento diário removido com sucesso."}
        else:
            return {"success": False, "error": proc.stderr or proc.stdout}
    except Exception as e:
        return {"success": False, "error": str(e)}

def run_task_now() -> dict:
    """Dispara a execução da tarefa imediatamente."""
    try:
        cmd = ["schtasks", "/Run", "/TN", TASK_NAME]
        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        if proc.returncode == 0:
            return {"success": True, "message": "Tarefa disparada em segundo plano com sucesso."}
        else:
            # Se a tarefa do schtasks não estiver instalada, roda via script diretamente
            subprocess.Popen([sys.executable, str(PYTHON_SCRIPT)])
            return {"success": True, "message": "Executando rotina diária em segundo plano via Python."}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_linux_cron_string(time_str: str = "03:00") -> str:
    """Retorna a sintaxe crontab clássica para quem usa WSL ou Linux."""
    try:
        parts = time_str.split(":")
        minute = int(parts[1]) if len(parts) > 1 else 0
        hour = int(parts[0]) if len(parts) > 0 else 3
    except Exception:
        hour, minute = 3, 0
    return f"{minute} {hour} * * * /usr/bin/python3 /mnt/d/Projetos/LifeOrganizer/run_daily.py >> /mnt/d/Projetos/LifeOrganizer/logs/daily_run.log 2>&1"

if __name__ == "__main__":
    print("Status Atual do Agendador:", get_task_status())
    print("\nExemplo Cron Linux/WSL:")
    print(get_linux_cron_string("03:00"))
