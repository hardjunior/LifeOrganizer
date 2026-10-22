"""
LifeOrganizer - Servidor Web API FastAPI
Interface Visual Estilo Google Fotos para Gerenciamento Inteligente de Arquivos e Pastas.
"""
import os
import subprocess
import threading
from typing import Optional, List
from pathlib import Path
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import (
    BASE_DIR,
    DB_PATH,
    THUMBNAILS_DIR,
    SERVER_PORT,
    SERVER_HOST,
    DESTINATION_FOLDERS,
    DEFAULT_SCAN_FOLDERS,
    D_ROOT
)
from db import get_connection, get_setting, set_setting, log_action
from scanner import scan_system, progress as scan_progress
from organizer import (
    move_file,
    rename_file,
    delete_file,
    safe_recycle_bin_delete,
    auto_organize_root_files,
    clean_temp_files
)
import scheduler

app = FastAPI(title="LifeOrganizer API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Modelos Pydantic
class RenameRequest(BaseModel):
    source_path: str
    new_filename: str

class MoveRequest(BaseModel):
    source_path: str
    dest_dir: str

class DeleteRequest(BaseModel):
    source_path: str
    permanent: bool = False

class DeleteFolderRequest(BaseModel):
    folder_path: str
    permanent: bool = False

class BatchActionRequest(BaseModel):
    action: str  # "move" ou "delete"
    file_paths: List[str]
    dest_dir: Optional[str] = None
    permanent: Optional[bool] = False

class ScheduleInstallRequest(BaseModel):
    time: str = "03:00"

class ExplorerOpenRequest(BaseModel):
    path: str

class SingleMoveRequest(BaseModel):
    source_path: str
    dest_dir: str

@app.get("/")
def index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse({"message": "LifeOrganizer API rodando."})

@app.get("/api/status")
def get_status():
    """Retorna status do sistema, escaneamento e agendador."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM files")
        total_files = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM folders")
        total_folders = cursor.fetchone()[0]
        cursor.execute("SELECT sum(size_bytes) FROM files")
        total_size = cursor.fetchone()[0] or 0
        
    sched_status = scheduler.get_task_status()
    
    return {
        "scan_status": scan_progress.status,
        "files_scanned_current": scan_progress.files_scanned,
        "folders_scanned_current": scan_progress.folders_scanned,
        "current_folder": scan_progress.current_folder,
        "total_files_in_db": total_files,
        "total_folders_in_db": total_folders,
        "total_size_bytes": total_size,
        "last_scan_time": get_setting("last_scan_time", "Nunca"),
        "last_cron_run": get_setting("last_cron_run", "Nunca"),
        "scheduler": sched_status
    }

@app.get("/api/stats")
def get_stats():
    """Retorna estatísticas detalhadas de categorias, duplicados e arquivos soltos."""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT category, count(*) as count, sum(size_bytes) as total_size
            FROM files
            GROUP BY category
            ORDER BY count DESC
        """)
        categories = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute("SELECT count(*), sum(size_bytes) FROM files WHERE is_root_file = 1")
        root_row = cursor.fetchone()
        root_count = root_row[0]
        root_size = root_row[1] or 0
        
        cursor.execute("SELECT count(*), sum(size_bytes) FROM files WHERE is_duplicate = 1")
        dup_row = cursor.fetchone()
        dup_count = dup_row[0]
        dup_size = dup_row[1] or 0
        
        cursor.execute("SELECT count(*), sum(size_bytes) FROM files")
        tot_row = cursor.fetchone()
        
    return {
        "categories": categories,
        "root_files": {"count": root_count, "size_bytes": root_size},
        "duplicates": {"count": dup_count, "size_bytes": dup_size},
        "total": {"count": tot_row[0], "size_bytes": tot_row[1] or 0}
    }

@app.get("/api/files")
def get_files(
    category: Optional[str] = None,
    search: Optional[str] = None,
    folder: Optional[str] = None,
    owner: Optional[str] = None,
    period: Optional[str] = None,  # "7days", "30days", "year2026", "year2025", "older"
    heavy_only: bool = False,      # > 100MB
    root_only: bool = False,
    duplicates_only: bool = False,
    recursive: bool = False,
    sort_by: str = "modified_desc",
    page: int = 1,
    limit: int = 50
):
    """Retorna arquivos paginados com múltiplos filtros avançados."""
    query = "SELECT * FROM files WHERE 1=1"
    params = []
    
    if category and category != "all":
        query += " AND category = ?"
        params.append(category)
        
    if search:
        query += " AND (filename LIKE ? OR path LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
        
    if folder:
        clean_folder = os.path.normpath(folder)
        if recursive:
            clean_f_prefix = clean_folder.rstrip('\\')
            query += " AND (directory = ? OR directory LIKE ?)"
            params.extend([clean_folder, f"{clean_f_prefix}\\%"])
        else:
            query += " AND directory = ?"
            params.append(clean_folder)
        
    if owner and owner != "all":
        query += " AND creator_owner LIKE ?"
        params.append(f"%{owner}%")
        
    if root_only:
        query += " AND is_root_file = 1"
        
    if duplicates_only:
        query += " AND is_duplicate = 1"
        
    if heavy_only:
        query += " AND size_bytes >= 104857600"  # 100 MB
        
    # Filtro por Período
    now = datetime.now()
    if period == "today":
        today_str = now.strftime("%Y-%m-%d")
        query += " AND modified_at >= ?"
        params.append(today_str)
    elif period == "7days":
        date_7d = (now - timedelta(days=7)).isoformat()
        query += " AND modified_at >= ?"
        params.append(date_7d)
    elif period == "30days":
        date_30d = (now - timedelta(days=30)).isoformat()
        query += " AND modified_at >= ?"
        params.append(date_30d)
    elif period == "year2026":
        query += " AND modified_at >= '2026-01-01' AND modified_at <= '2026-12-31T23:59:59'"
    elif period == "year2025":
        query += " AND modified_at >= '2025-01-01' AND modified_at <= '2025-12-31T23:59:59'"
    elif period == "older":
        query += " AND modified_at < '2025-01-01'"
        
    # Mapeamento de Ordenação
    order_map = {
        "modified_desc": "modified_at DESC",
        "modified_asc": "modified_at ASC",
        "created_desc": "created_at DESC",
        "created_asc": "created_at ASC",
        "size_desc": "size_bytes DESC",
        "size_asc": "size_bytes ASC",
        "name_asc": "filename COLLATE NOCASE ASC",
        "name_desc": "filename COLLATE NOCASE DESC"
    }
    order_clause = order_map.get(sort_by, "modified_at DESC")
    
    count_query = query.replace("SELECT *", "SELECT count(*)")
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(count_query, params)
        total_items = cursor.fetchone()[0]
        
        offset = (page - 1) * limit
        query += f" ORDER BY {order_clause} LIMIT ? OFFSET ?"
        exec_params = list(params) + [limit, offset]
        
        cursor.execute(query, exec_params)
        rows = cursor.fetchall()
        
    items = []
    for r in rows:
        d = dict(r)
        d["has_thumbnail"] = bool(d["thumbnail_path"] and os.path.exists(d["thumbnail_path"]))
        items.append(d)
        
    return {
        "items": items,
        "total": total_items,
        "page": page,
        "limit": limit,
        "total_pages": (total_items + limit - 1) // limit if limit > 0 else 1
    }

@app.get("/api/mindmap")
def get_mindmap():
    """
    Retorna os ramos principais para o ponto de partida do Mapa Mental.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Total Geral
        cursor.execute("SELECT count(*), sum(size_bytes) FROM files")
        tot = cursor.fetchone()
        root_count, root_size = tot[0], tot[1] or 0
        
        # Arquivos Soltos na Raiz de D:\
        cursor.execute("SELECT count(*), sum(size_bytes) FROM files WHERE is_root_file = 1")
        loose_row = cursor.fetchone()
        loose_count = loose_row[0]
        loose_size = loose_row[1] or 0
        
        cursor.execute("""
            SELECT path, name, creator_owner, file_count, total_size_bytes
            FROM folders
            WHERE parent_path = 'D:\\' OR parent_path = '' OR parent_path = 'D:'
            ORDER BY name ASC
        """)
        top_folders = []
        for r in cursor.fetchall():
            folder_path = r["path"]
            cursor.execute("SELECT count(*) FROM folders WHERE parent_path = ?", (folder_path,))
            child_count = cursor.fetchone()[0]
            top_folders.append({
                "path": folder_path,
                "name": r["name"],
                "creator_owner": r["creator_owner"],
                "file_count": r["file_count"],
                "total_size_bytes": r["total_size_bytes"],
                "has_subfolders": child_count > 0,
                "subfolder_count": child_count
            })
            
    return {
        "root": {
            "path": "D:\\",
            "name": "D:\\ (Disco Principal)",
            "total_files": root_count,
            "total_size_bytes": root_size,
            "loose_count": loose_count,
            "loose_size_bytes": loose_size
        },
        "branches": top_folders
    }

@app.get("/api/mindmap/children")
def get_mindmap_children(path: str = "D:\\", include_files: bool = True):
    """
    Retorna os filhos imediatos (subpastas e arquivos) de QUALQUER nó em profundidade ilimitada.
    Permite expansão dinâmica infinita nó por nó no Mapa Mental.
    """
    clean_path = path.rstrip("\\")
    if not clean_path:
        clean_path = "D:\\"
    elif len(clean_path) == 2 and clean_path[1] == ":":
        clean_path += "\\"
        
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Informações da pasta atual
        cursor.execute("SELECT * FROM folders WHERE path = ?", (clean_path,))
        curr = cursor.fetchone()
        curr_info = dict(curr) if curr else {
            "path": clean_path,
            "name": Path(clean_path).name or clean_path,
            "creator_owner": "Sistema",
            "file_count": 0,
            "total_size_bytes": 0,
            "parent_path": str(Path(clean_path).parent)
        }
        
        # Subpastas imediatas
        cursor.execute("""
            SELECT path, name, creator_owner, file_count, total_size_bytes
            FROM folders
            WHERE parent_path = ?
            ORDER BY name ASC
        """, (clean_path,))
        subfolders = []
        for r in cursor.fetchall():
            sub_path = r["path"]
            cursor.execute("SELECT count(*) FROM folders WHERE parent_path = ?", (sub_path,))
            child_f_count = cursor.fetchone()[0]
            subfolders.append({
                "path": sub_path,
                "name": r["name"],
                "creator_owner": r["creator_owner"],
                "file_count": r["file_count"],
                "total_size_bytes": r["total_size_bytes"],
                "has_subfolders": child_f_count > 0,
                "subfolder_count": child_f_count
            })
            
        # Arquivos imediatos desta pasta
        files = []
        if include_files:
            cursor.execute("""
                SELECT id, path, filename, extension, category, size_bytes, modified_at, creator_owner, thumbnail_path
                FROM files
                WHERE directory = ?
                ORDER BY filename ASC
                LIMIT 80
            """, (clean_path,))
            for f in cursor.fetchall():
                f_dict = dict(f)
                f_dict["has_thumbnail"] = bool(f_dict["thumbnail_path"] and os.path.exists(f_dict["thumbnail_path"]))
                files.append(f_dict)
                
    # Cálculo da linhagem (ancestrais)
    p = Path(clean_path)
    ancestors = []
    curr_p = p
    while True:
        ancestors.append(str(curr_p))
        if curr_p.parent == curr_p:
            break
        curr_p = curr_p.parent
    ancestors.reverse()
    
    return {
        "node": curr_info,
        "subfolders": subfolders,
        "files": files,
        "lineage": ancestors
    }

@app.get("/api/mindmap/trace")
def trace_mindmap_lineage(target_path: str):
    r"""
    Rastreia e expande toda a árvore desde D:\ até o link específico solicitado.
    Garante que ao abrir um link, o mapa mental siga e construa a árvore daquele link!
    """
    target = Path(target_path)
    if not target.is_dir():
        target = target.parent
        
    ancestors = []
    curr = target
    while True:
        ancestors.append(str(curr))
        if curr.parent == curr:
            break
        curr = curr.parent
    ancestors.reverse()
    
    trace_data = []
    for step in ancestors:
        children_data = get_mindmap_children(path=step, include_files=True)
        trace_data.append(children_data)
        
    return {
        "target": str(target),
        "lineage": ancestors,
        "steps": trace_data
    }

@app.get("/api/timeline")
def get_timeline():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                substr(modified_at, 1, 7) as year_month,
                count(*) as file_count,
                sum(size_bytes) as total_size
            FROM files
            GROUP BY year_month
            ORDER BY year_month DESC
            LIMIT 36
        """)
        groups = [dict(row) for row in cursor.fetchall()]
    return {"timeline": groups}

@app.get("/api/tree")
def get_folder_tree():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM folders ORDER BY path ASC")
        folders = [dict(row) for row in cursor.fetchall()]
    return {"folders": folders}

@app.get("/api/thumbnail/{file_id}")
def get_file_thumbnail(file_id: int):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT thumbnail_path FROM files WHERE id = ?", (file_id,))
        row = cursor.fetchone()
        
    if not row or not row["thumbnail_path"] or not os.path.exists(row["thumbnail_path"]):
        raise HTTPException(status_code=404, detail="Miniatura não encontrada")
        
    return FileResponse(row["thumbnail_path"], media_type="image/webp")

@app.get("/api/preview/{file_id}")
def preview_file(file_id: int):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT path, category, filename FROM files WHERE id = ?", (file_id,))
        row = cursor.fetchone()
        
    if not row or not os.path.exists(row["path"]):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no disco")
        
    return FileResponse(row["path"], filename=row["filename"])

def launch_explorer_cmd(full_cmd: str, target: str, msg: str):
    r"""
    Executa o Windows Explorer direcionando explicitamente para a Área de Trabalho física
    interativa do usuário (WinSta0\Default), garantindo que a janela apareça visivelmente na tela.
    """
    try:
        import ctypes
        from ctypes import wintypes
        kernel32 = ctypes.windll.kernel32
        
        class _STARTUPINFO(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("lpReserved", wintypes.LPWSTR),
                ("lpDesktop", wintypes.LPWSTR),
                ("lpTitle", wintypes.LPWSTR),
                ("dwX", wintypes.DWORD),
                ("dwY", wintypes.DWORD),
                ("dwXSize", wintypes.DWORD),
                ("dwYSize", wintypes.DWORD),
                ("dwXCountChars", wintypes.DWORD),
                ("dwYCountChars", wintypes.DWORD),
                ("dwFillAttribute", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD),
                ("wShowWindow", wintypes.WORD),
                ("cbReserved2", wintypes.WORD),
                ("lpReserved2", ctypes.c_void_p),
                ("hStdInput", wintypes.HANDLE),
                ("hStdOutput", wintypes.HANDLE),
                ("hStdError", wintypes.HANDLE),
            ]

        class _PROCESS_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("hProcess", wintypes.HANDLE),
                ("hThread", wintypes.HANDLE),
                ("dwProcessId", wintypes.DWORD),
                ("dwThreadId", wintypes.DWORD),
            ]

        si = _STARTUPINFO()
        si.cb = ctypes.sizeof(_STARTUPINFO)
        si.lpDesktop = r"WinSta0\Default"  # Área de trabalho física interativa do usuário
        si.dwFlags = 1  # STARTF_USESHOWWINDOW
        si.wShowWindow = 1  # SW_SHOWNORMAL
        
        pi = _PROCESS_INFORMATION()
        res = kernel32.CreateProcessW(
            None,
            full_cmd,
            None,
            None,
            False,
            0,
            None,
            None,
            ctypes.byref(si),
            ctypes.byref(pi)
        )
        if res:
            kernel32.CloseHandle(pi.hProcess)
            kernel32.CloseHandle(pi.hThread)
            return {"success": True, "path": target, "message": msg}
    except Exception as e:
        print(f"[EXPLORER] CreateProcessW na WinSta0\\Default falhou ({e}), tentando fallback...")

    # Fallback caso CreateProcessW falhe
    try:
        subprocess.Popen(full_cmd)
        return {"success": True, "path": target, "message": msg}
    except Exception as ex:
        try:
            os.startfile(target)
            return {"success": True, "path": target, "message": msg}
        except Exception as ex2:
            raise HTTPException(status_code=500, detail=f"Erro ao abrir Explorer: {ex} | {ex2}")

@app.post("/api/files/open-in-explorer")
def api_open_in_explorer(req: ExplorerOpenRequest):
    r"""
    Abre a pasta ou revela o arquivo diretamente no Windows Explorer nativo,
    projetado na tela interativa física do usuário.
    """
    raw_path = req.path.strip() if req.path else ""
    if not raw_path:
        raw_path = "D:\\"
        
    clean_path = os.path.normpath(raw_path)
    explorer_exe = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "explorer.exe")
    if not os.path.exists(explorer_exe):
        explorer_exe = "explorer.exe"
        
    if os.path.isdir(clean_path):
        return launch_explorer_cmd(
            f'"{explorer_exe}" "{clean_path}"',
            clean_path,
            f"Pasta aberta no Explorer: {clean_path}"
        )
    elif os.path.isfile(clean_path):
        return launch_explorer_cmd(
            f'"{explorer_exe}" /select,"{clean_path}"',
            clean_path,
            f"Arquivo revelado no Explorer: {clean_path}"
        )
    else:
        # Caminho não existe mais no disco - busca o diretório pai mais próximo existente
        parent = os.path.dirname(clean_path)
        while parent and not os.path.exists(parent):
            next_parent = os.path.dirname(parent)
            if next_parent == parent:
                break
            parent = next_parent
            
        if parent and os.path.exists(parent):
            return launch_explorer_cmd(
                f'"{explorer_exe}" "{parent}"',
                parent,
                f"O item original não existe no disco. A pasta '{os.path.basename(parent) or parent}' foi aberta no Explorer."
            )
        else:
            return launch_explorer_cmd(
                f'"{explorer_exe}" "D:\\"',
                "D:\\",
                "Caminho não encontrado no disco. Disco D:\\ aberto no Explorer."
            )

@app.post("/api/folders/delete")
def api_delete_folder(req: DeleteFolderRequest):
    r"""
    Exclui uma pasta completa enviando-a para a Lixeira do Windows (recuperável).
    Protege raízes do disco e a pasta do LifeOrganizer.
    """
    raw_folder = req.folder_path.strip()
    if not raw_folder:
        raise HTTPException(status_code=400, detail="Caminho de pasta vazio")
        
    folder = os.path.normpath(raw_folder)
    
    # Bloqueio de segurança para unidades de disco
    if folder in ["D:\\", "D:", "C:\\", "C:", "\\\\"]:
        raise HTTPException(status_code=400, detail="Não é permitido excluir a raiz do disco!")
        
    base_dir_norm = os.path.normpath(str(BASE_DIR))
    if folder == base_dir_norm or folder.startswith(base_dir_norm + "\\"):
        raise HTTPException(status_code=400, detail="Não é permitido excluir a pasta do LifeOrganizer!")
        
    if not os.path.exists(folder):
        raise HTTPException(status_code=404, detail="Pasta não encontrada no disco.")
        
    # Envia para a Lixeira segura do Windows (com opção de restaurar)
    success = safe_recycle_bin_delete(folder)
    if not success:
        raise HTTPException(status_code=500, detail="Falha ao enviar a pasta para a Lixeira do Windows.")
        
    # Atualiza banco de dados SQLite
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM folders WHERE path = ? OR path LIKE ?", (folder, f"{folder}\\%"))
        cursor.execute("DELETE FROM files WHERE directory = ? OR directory LIKE ?", (folder, f"{folder}\\%"))
        conn.commit()
        
    log_action("delete_folder", folder, "", "success", "Pasta enviada para a Lixeira do Windows.")
    return {"success": True, "message": f"Pasta '{Path(folder).name}' enviada para a Lixeira com sucesso."}

@app.post("/api/files/rename")
def api_rename_file(req: RenameRequest):
    res = rename_file(req.source_path, req.new_filename)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/files/move")
def api_move_file(req: MoveRequest):
    res = move_file(req.source_path, req.dest_dir)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/files/delete")
def api_delete_file(req: DeleteRequest):
    res = delete_file(req.source_path, req.permanent)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/files/batch-action")
def api_batch_action(req: BatchActionRequest):
    results = []
    success_count = 0
    fail_count = 0
    
    for path in req.file_paths:
        if req.action == "delete":
            res = delete_file(path, permanent=req.permanent)
        elif req.action == "move" and req.dest_dir:
            res = move_file(path, req.dest_dir)
        else:
            res = {"success": False, "error": "Ação inválida"}
            
        if res.get("success"):
            success_count += 1
        else:
            fail_count += 1
        results.append({"path": path, "result": res})
        
    return {
        "action": req.action,
        "total": len(req.file_paths),
        "success_count": success_count,
        "fail_count": fail_count,
        "details": results
    }

@app.post("/api/scan/start")
def start_scan_bg(background_tasks: BackgroundTasks):
    if scan_progress.status == "running":
        return {"success": False, "message": "Um escaneamento já está em andamento."}
        
    background_tasks.add_task(scan_system)
    return {"success": True, "message": "Escaneamento iniciado em segundo plano."}

@app.get("/api/scan/progress")
def get_scan_progress():
    return {
        "status": scan_progress.status,
        "files_scanned": scan_progress.files_scanned,
        "folders_scanned": scan_progress.folders_scanned,
        "current_folder": scan_progress.current_folder,
        "errors": scan_progress.errors
    }

@app.get("/api/organize/preview-root")
def preview_root_organize():
    return auto_organize_root_files(dry_run=True)

@app.post("/api/organize/execute-root")
def execute_root_organize():
    return auto_organize_root_files(dry_run=False)

@app.post("/api/organize/move-single-root")
def move_single_root(req: SingleMoveRequest):
    return move_file(req.source_path, req.dest_dir)

@app.post("/api/organize/clean-temp-now")
def clean_temp_now():
    return clean_temp_files(dry_run=False, max_age_days=14)

@app.get("/api/organize/duplicates")
def get_duplicate_groups():
    with get_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE files 
            SET is_duplicate = 1 
            WHERE hash_md5 != '' AND hash_md5 != 'empty' AND hash_md5 IS NOT NULL 
              AND hash_md5 IN (
                SELECT hash_md5 
                FROM files 
                WHERE hash_md5 != '' AND hash_md5 != 'empty' AND hash_md5 IS NOT NULL
                GROUP BY hash_md5 
                HAVING count(*) > 1
            )
        """)
        conn.commit()
        
        cursor.execute("""
            SELECT hash_md5, count(*) as count, sum(size_bytes) as total_size
            FROM files
            WHERE is_duplicate = 1 AND hash_md5 != '' AND hash_md5 != 'empty'
            GROUP BY hash_md5
            ORDER BY total_size DESC
            LIMIT 40
        """)
        groups = cursor.fetchall()
        
        result = []
        for g in groups:
            h = g["hash_md5"]
            cursor.execute("SELECT * FROM files WHERE hash_md5 = ? ORDER BY modified_at DESC", (h,))
            files_in_group = [dict(r) for r in cursor.fetchall()]
            result.append({
                "hash": h,
                "count": g["count"],
                "total_size": g["total_size"],
                "files": files_in_group
            })
            
    return {"duplicate_groups": result}

@app.get("/api/scheduler")
def api_get_scheduler():
    status = scheduler.get_task_status()
    status["linux_cron"] = scheduler.get_linux_cron_string(status.get("scheduled_time", "03:00"))
    return status

@app.post("/api/scheduler/install")
def api_install_scheduler(req: ScheduleInstallRequest):
    res = scheduler.install_task(req.time)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error"))
    return res

@app.post("/api/scheduler/uninstall")
def api_uninstall_scheduler():
    res = scheduler.uninstall_task()
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error"))
    return res

@app.post("/api/scheduler/run-now")
def api_run_scheduler_now():
    return scheduler.run_task_now()

@app.get("/api/history")
def get_action_history(limit: int = 50):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM organize_history ORDER BY id DESC LIMIT ?", (limit,))
        history = [dict(row) for row in cursor.fetchall()]
    return {"history": history}

if __name__ == "__main__":
    import uvicorn
    print(f"Iniciando LifeOrganizer em http://{SERVER_HOST}:{SERVER_PORT}")
    uvicorn.run("server:app", host=SERVER_HOST, port=SERVER_PORT, reload=False)
