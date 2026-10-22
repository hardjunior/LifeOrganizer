"""
LifeOrganizer - Motor de Organização, Limpeza e Gestão da Vida Digital
Capaz de Renomear, Mover, Enviar para Lixeira Segura (com recuperação),
Auto-Organizar arquivos soltos e Limpar arquivos temporários.
"""
import os
import shutil
from pathlib import Path
from datetime import datetime, timedelta
import win32security
from win32com.shell import shell, shellcon

from config import (
    DESTINATION_FOLDERS,
    PROTECTED_ROOT_FILES,
    TEMP_EXTENSIONS
)
from db import get_connection, log_action

def safe_recycle_bin_delete(file_path: str) -> bool:
    """
    Envia o arquivo para a Lixeira do Windows (com opção de desfazer / recuperação).
    Não deleta permanentemente a menos que a lixeira seja esvaziada pelo usuário.
    """
    abs_path = os.path.abspath(file_path)
    if not os.path.exists(abs_path):
        return False
        
    try:
        # SHFileOperation requer string terminada com duplo null
        res = shell.SHFileOperation((
            0,
            shellcon.FO_DELETE,
            abs_path + '\0',
            None,
            shellcon.FOF_ALLOWUNDO | shellcon.FOF_NOCONFIRMATION | shellcon.FOF_SILENT,
            None,
            None
        ))
        return res[0] == 0
    except Exception as e:
        print(f"Erro ao enviar para lixeira: {e}")
        return False

def get_unique_destination_path(dest_dir: str, filename: str) -> str:
    """Gera nome único se já existir arquivo com o mesmo nome na pasta de destino."""
    dest_path = Path(dest_dir) / filename
    if not dest_path.exists():
        return str(dest_path)
        
    stem = dest_path.stem
    suffix = dest_path.suffix
    counter = 1
    while True:
        candidate = Path(dest_dir) / f"{stem} ({counter}){suffix}"
        if not candidate.exists():
            return str(candidate)
        counter += 1

def move_file(source_path: str, dest_dir: str, new_filename: str = None) -> dict:
    """Move um arquivo para um novo diretório com segurança e atualiza o banco de dados."""
    src = Path(source_path)
    if not src.exists():
        return {"success": False, "error": "Arquivo de origem não encontrado."}
        
    dest_directory = Path(dest_dir)
    dest_directory.mkdir(parents=True, exist_ok=True)
    
    final_name = new_filename if new_filename else src.name
    final_dest_str = get_unique_destination_path(str(dest_directory), final_name)
    
    try:
        shutil.move(str(src), final_dest_str)
        now_iso = datetime.now().isoformat()
        
        # Atualiza banco de dados
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE files 
                SET path = ?, filename = ?, directory = ?, is_root_file = 0, updated_at = ?
                WHERE path = ?
            """, (final_dest_str, Path(final_dest_str).name, str(dest_directory), now_iso, source_path))
            conn.commit()
            
        log_action("move", source_path, final_dest_str, "success", f"Movido para {dest_dir}")
        return {"success": True, "source": source_path, "destination": final_dest_str}
    except Exception as e:
        log_action("move", source_path, final_dest_str, "error", str(e))
        return {"success": False, "error": str(e)}

def rename_file(source_path: str, new_filename: str) -> dict:
    """Renomeia um arquivo de forma segura."""
    src = Path(source_path)
    if not src.exists():
        return {"success": False, "error": "Arquivo não encontrado."}
        
    dest_path = src.parent / new_filename
    if dest_path.exists() and dest_path != src:
        return {"success": False, "error": "Já existe um arquivo com esse nome no diretório."}
        
    try:
        src.rename(dest_path)
        dest_str = str(dest_path)
        now_iso = datetime.now().isoformat()
        
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE files 
                SET path = ?, filename = ?, updated_at = ?
                WHERE path = ?
            """, (dest_str, new_filename, now_iso, source_path))
            conn.commit()
            
        log_action("rename", source_path, dest_str, "success", f"Renomeado para {new_filename}")
        return {"success": True, "source": source_path, "destination": dest_str}
    except Exception as e:
        log_action("rename", source_path, "", "error", str(e))
        return {"success": False, "error": str(e)}

def delete_file(source_path: str, permanent: bool = False) -> dict:
    """Exclui um arquivo (por padrão envia para a Lixeira com possibilidade de restaurar)."""
    src = Path(source_path)
    if not src.exists():
        # Remove do banco se já não existir fisicamente
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM files WHERE path = ?", (source_path,))
            conn.commit()
        return {"success": True, "message": "Arquivo já não existia no disco; registro removido."}
        
    try:
        if permanent:
            src.unlink()
            method = "permanent_delete"
        else:
            success = safe_recycle_bin_delete(source_path)
            if not success:
                return {"success": False, "error": "Falha ao enviar arquivo para a Lixeira do Windows."}
            method = "recycle_bin"
            
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM files WHERE path = ?", (source_path,))
            conn.commit()
            
        log_action("delete", source_path, "", "success", f"Excluído via {method}")
        return {"success": True, "path": source_path, "method": method}
    except Exception as e:
        log_action("delete", source_path, "", "error", str(e))
        return {"success": False, "error": str(e)}

def auto_organize_root_files(dry_run: bool = True) -> dict:
    r"""
    Identifica arquivos soltos na raiz de D:\ e organiza automaticamente
    nas pastas corretas (Imagem, Documentos, Vídeos, Músicas, Projetos, etc.).
    Protege arquivos vitais do sistema.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM files WHERE is_root_file = 1")
        root_files = cursor.fetchall()
        
    actions = []
    skipped = []
    
    for row in root_files:
        fpath = row["path"]
        fname = row["filename"]
        category = row["category"]
        
        # Proteção de arquivos essenciais da raiz
        if fname.lower() in [p.lower() for p in PROTECTED_ROOT_FILES]:
            skipped.append({"path": fpath, "reason": "Arquivo protegido de sistema"})
            continue
            
        dest_folder = DESTINATION_FOLDERS.get(category)
        if not dest_folder:
            skipped.append({"path": fpath, "reason": f"Sem regra de destino para categoria '{category}'"})
            continue
            
        action = {
            "file": fname,
            "source": fpath,
            "destination_dir": dest_folder,
            "category": category
        }
        
        if not dry_run:
            res = move_file(fpath, dest_folder)
            action["status"] = "moved" if res.get("success") else f"error: {res.get('error')}"
        else:
            action["status"] = "preview"
            
        actions.append(action)
        
    return {
        "dry_run": dry_run,
        "total_root_files": len(root_files),
        "organized_count": len(actions),
        "skipped_count": len(skipped),
        "actions": actions,
        "skipped": skipped
    }

def clean_temp_files(dry_run: bool = True, max_age_days: int = 14) -> dict:
    """
    Identifica e envia arquivos temporários antigos para a Lixeira.
    """
    cutoff = datetime.now() - timedelta(days=max_age_days)
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM files")
        all_files = cursor.fetchall()
        
    cleaned = []
    
    for row in all_files:
        ext = row["extension"].lower()
        if ext in TEMP_EXTENSIONS or "tmp" in row["directory"].lower():
            try:
                mod_time = datetime.fromisoformat(row["modified_at"])
                if mod_time < cutoff:
                    item = {
                        "path": row["path"],
                        "size_bytes": row["size_bytes"],
                        "modified_at": row["modified_at"]
                    }
                    if not dry_run:
                        res = delete_file(row["path"], permanent=False)
                        item["status"] = "trashed" if res.get("success") else "error"
                    else:
                        item["status"] = "preview"
                    cleaned.append(item)
            except Exception:
                pass
                
    return {
        "dry_run": dry_run,
        "cleaned_count": len(cleaned),
        "items": cleaned
    }

if __name__ == "__main__":
    print("Testando Simulação de Organização Automática dos Arquivos da Raiz...")
    res = auto_organize_root_files(dry_run=True)
    print(f"Arquivos soltos encontrados: {res['total_root_files']}")
    print(f"Ações propostas: {res['organized_count']}")
    for act in res["actions"][:10]:
        print(f" -> {act['file']} [{act['category']}] => {act['destination_dir']}")
