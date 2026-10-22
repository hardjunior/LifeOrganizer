"""
LifeOrganizer - Motor de Escaneamento e Extração de Metadados
Identifica Nome, Árvore de Diretórios, Data (Criação/Modificação), Tipo, Criador/Owner,
Gera Miniaturas para Visualização Estilo Google Fotos e Detecta Duplicatas.
"""
import os
import sys
import hashlib
from datetime import datetime
from pathlib import Path
from PIL import Image
import win32security

from config import (
    DEFAULT_SCAN_FOLDERS,
    SCAN_D_ROOT,
    D_ROOT,
    IGNORED_DIRS,
    CATEGORY_EXTENSIONS,
    THUMBNAILS_DIR
)
from db import get_connection, set_setting, get_setting

# Cache para SIDs resolvidos para acelerar escaneamento
OWNER_CACHE = {}

def resolve_owner(file_path: str) -> str:
    """Extrai e resolve o proprietário/criador no Windows com cache inteligente."""
    try:
        sd = win32security.GetFileSecurity(file_path, win32security.OWNER_SECURITY_INFORMATION)
        owner_sid = sd.GetSecurityDescriptorOwner()
        if not owner_sid:
            return "Desconhecido"
            
        sid_str = win32security.ConvertSidToStringSid(owner_sid)
        if sid_str in OWNER_CACHE:
            return OWNER_CACHE[sid_str]
            
        try:
            name, domain, _ = win32security.LookupAccountSid(None, owner_sid)
            result = f"{domain}\\{name}" if domain else name
        except Exception:
            if sid_str.startswith("S-1-12-1-"):
                result = "Conta Microsoft (Junior)"
            elif sid_str.endswith("-1001"):
                result = "Junior (Usuário Principal)"
            elif "544" in sid_str or "Administrators" in sid_str:
                result = "Administradores"
            elif "S-1-5-18" in sid_str:
                result = "SYSTEM"
            else:
                result = f"Usuário ({sid_str[:12]}...)"
                
        OWNER_CACHE[sid_str] = result
        return result
    except Exception:
        return "Sistema / Padrão"

def determine_category(extension: str) -> str:
    """Categoriza o arquivo com base na extensão."""
    ext = extension.lower()
    for category, exts in CATEGORY_EXTENSIONS.items():
        if ext in exts:
            return category
    return "other"

def generate_quick_hash(file_path: str, size: int) -> str:
    """Gera hash rápido para identificação de duplicados."""
    try:
        if size == 0:
            return "empty"
        if size <= 2 * 1024 * 1024:
            hasher = hashlib.md5()
            with open(file_path, "rb") as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            return hasher.hexdigest()
        else:
            hasher = hashlib.md5()
            hasher.update(str(size).encode())
            with open(file_path, "rb") as f:
                hasher.update(f.read(65536))
                f.seek(max(0, size - 65536))
                hasher.update(f.read(65536))
            return hasher.hexdigest()
    except Exception:
        return ""

def create_thumbnail(file_path: str, category: str, file_hash: str) -> str:
    """Gera miniatura para imagem no estilo Google Fotos."""
    if category != "image" or not file_hash:
        return ""
        
    thumb_filename = f"{file_hash[:16]}.webp"
    thumb_path = THUMBNAILS_DIR / thumb_filename
    
    if thumb_path.exists():
        return str(thumb_path)
        
    try:
        with Image.open(file_path) as img:
            img = img.convert("RGB")
            img.thumbnail((320, 320), Image.Resampling.LANCZOS)
            img.save(thumb_path, "WEBP", quality=82)
            return str(thumb_path)
    except Exception:
        return ""

class ScanProgress:
    def __init__(self):
        self.files_scanned = 0
        self.folders_scanned = 0
        self.current_folder = ""
        self.errors = 0
        self.status = "idle"

progress = ScanProgress()

def scan_system(folders=None, include_root=True, progress_callback=None):
    """
    Executa o escaneamento das pastas da vida do usuário e arquivos soltos da raiz.
    Extrai nome, árvore, data de criação/modificação, tipo e criador.
    """
    if folders is None:
        folders = DEFAULT_SCAN_FOLDERS
        
    progress.status = "running"
    progress.files_scanned = 0
    progress.folders_scanned = 0
    progress.errors = 0
    
    set_setting("scan_status", "scanning")
    now_iso = datetime.now().isoformat()
    
    conn = get_connection()
    cursor = conn.cursor()
    
    files_batch = []
    folders_batch = []
    
    try:
        # 1. Escanear arquivos soltos diretamente na raiz de D:\ (se ativado)
        if include_root and SCAN_D_ROOT:
            root_path = Path(D_ROOT)
            if root_path.exists():
                progress.current_folder = str(root_path)
                try:
                    with os.scandir(str(root_path)) as entries:
                        for entry in entries:
                            if entry.is_file(follow_symlinks=False):
                                fname = entry.name
                                fpath_str = entry.path
                                try:
                                    stat = entry.stat()
                                    size = stat.st_size
                                    ext = Path(fname).suffix.lower()
                                    category = determine_category(ext)
                                    created_dt = datetime.fromtimestamp(stat.st_ctime).isoformat()
                                    modified_dt = datetime.fromtimestamp(stat.st_mtime).isoformat()
                                    owner = resolve_owner(fpath_str)
                                    file_hash = generate_quick_hash(fpath_str, size)
                                    thumbnail = create_thumbnail(fpath_str, category, file_hash)
                                    
                                    files_batch.append((
                                        fpath_str, fname, ext, str(root_path), size,
                                        created_dt, modified_dt, category, owner,
                                        file_hash, 1, 0, thumbnail, now_iso
                                    ))
                                    progress.files_scanned += 1
                                except Exception:
                                    progress.errors += 1
                except Exception as ex:
                    print(f"Erro ao ler raiz {D_ROOT}: {ex}")

        # 2. Escanear pastas de conteúdo do usuário recursivamente
        for folder in folders:
            folder_path = Path(folder)
            if not folder_path.exists():
                continue
                
            for dirpath, dirnames, filenames in os.walk(folder):
                # Filtrar diretórios ignorados
                dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS and not d.startswith("$") and not d.startswith(".")]
                
                current_dir = Path(dirpath)
                progress.current_folder = str(current_dir)
                progress.folders_scanned += 1
                
                # Dados da Pasta
                parent_dir = str(current_dir.parent) if current_dir.parent != current_dir else ""
                folder_owner = resolve_owner(str(current_dir))
                
                folders_batch.append((
                    str(current_dir),
                    parent_dir,
                    current_dir.name,
                    folder_owner,
                    len(filenames),
                    0,
                    now_iso
                ))
                
                for fname in filenames:
                    progress.files_scanned += 1
                    file_path = current_dir / fname
                    file_str = str(file_path)
                    
                    try:
                        stat = file_path.stat()
                        size = stat.st_size
                        ext = file_path.suffix.lower()
                        category = determine_category(ext)
                        
                        created_dt = datetime.fromtimestamp(stat.st_ctime).isoformat()
                        modified_dt = datetime.fromtimestamp(stat.st_mtime).isoformat()
                        
                        owner = resolve_owner(file_str)
                        file_hash = generate_quick_hash(file_str, size)
                        thumbnail = create_thumbnail(file_str, category, file_hash)
                        
                        files_batch.append((
                            file_str,
                            fname,
                            ext,
                            str(current_dir),
                            size,
                            created_dt,
                            modified_dt,
                            category,
                            owner,
                            file_hash,
                            0,
                            0,
                            thumbnail,
                            now_iso
                        ))
                    except Exception:
                        progress.errors += 1
                        
                    if len(files_batch) >= 200:
                        _flush_batches(cursor, files_batch, folders_batch)
                        conn.commit()
                        files_batch.clear()
                        folders_batch.clear()
                        if progress_callback:
                            progress_callback(progress)
                            
        if files_batch or folders_batch:
            _flush_batches(cursor, files_batch, folders_batch)
            conn.commit()
            files_batch.clear()
            folders_batch.clear()
            
        # Marca duplicados (mesmo tamanho > 0 e hash idêntico)
        cursor.execute("""
            UPDATE files 
            SET is_duplicate = 1 
            WHERE hash_md5 != '' AND hash_md5 != 'empty' AND hash_md5 IS NOT NULL 
              AND hash_md5 IN (
                SELECT hash_md5 
                FROM files 
                WHERE hash_md5 != '' AND hash_md5 != 'empty'
                GROUP BY hash_md5, size_bytes 
                HAVING count(*) > 1
            )
        """)
        
        # Limpa arquivos removidos fisicamente
        cursor.execute("SELECT id, path FROM files")
        all_db_files = cursor.fetchall()
        deleted_ids = [row["id"] for row in all_db_files if not os.path.exists(row["path"])]
        if deleted_ids:
            cursor.executemany("DELETE FROM files WHERE id = ?", [(i,) for i in deleted_ids])
            
        conn.commit()
        
        set_setting("last_scan_time", now_iso)
        set_setting("scan_status", "completed")
        progress.status = "completed"
        
        print(f"[SCANNER] Concluído com sucesso! {progress.files_scanned} arquivos, {progress.folders_scanned} pastas catalogadas.")
        return {
            "success": True,
            "files_scanned": progress.files_scanned,
            "folders_scanned": progress.folders_scanned,
            "timestamp": now_iso
        }
        
    except Exception as e:
        progress.status = f"error: {str(e)}"
        set_setting("scan_status", f"error: {str(e)}")
        print(f"[SCANNER] Erro: {e}")
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def _flush_batches(cursor, files_batch, folders_batch):
    """Executa inserção/atualização otimizada em lote."""
    if files_batch:
        cursor.executemany("""
            INSERT INTO files (
                path, filename, extension, directory, size_bytes,
                created_at, modified_at, category, creator_owner,
                hash_md5, is_root_file, is_duplicate, thumbnail_path, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                size_bytes=excluded.size_bytes,
                modified_at=excluded.modified_at,
                category=excluded.category,
                creator_owner=excluded.creator_owner,
                hash_md5=excluded.hash_md5,
                is_root_file=excluded.is_root_file,
                thumbnail_path=CASE WHEN excluded.thumbnail_path != '' THEN excluded.thumbnail_path ELSE files.thumbnail_path END,
                updated_at=excluded.updated_at
        """, files_batch)
        
    if folders_batch:
        cursor.executemany("""
            INSERT INTO folders (
                path, parent_path, name, creator_owner, file_count, total_size_bytes, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                parent_path=excluded.parent_path,
                name=excluded.name,
                creator_owner=excluded.creator_owner,
                file_count=excluded.file_count,
                updated_at=excluded.updated_at
        """, folders_batch)

if __name__ == "__main__":
    print("Iniciando escaneamento do sistema...")
    res = scan_system()
    print("Resultado:", res)
