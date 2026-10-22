"""
LifeOrganizer - Gerenciador do Banco de Dados SQLite
"""
import sqlite3
import json
from datetime import datetime
from config import DB_PATH

def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Tabela de Arquivos
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                filename TEXT NOT NULL,
                extension TEXT,
                directory TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                modified_at TEXT NOT NULL,
                category TEXT NOT NULL,
                creator_owner TEXT,
                hash_md5 TEXT,
                is_root_file INTEGER DEFAULT 0,
                is_duplicate INTEGER DEFAULT 0,
                thumbnail_path TEXT,
                updated_at TEXT NOT NULL
            )
        """)
        
        # Tabela de Pastas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                parent_path TEXT,
                name TEXT NOT NULL,
                creator_owner TEXT,
                file_count INTEGER DEFAULT 0,
                total_size_bytes INTEGER DEFAULT 0,
                updated_at TEXT NOT NULL
            )
        """)
        
        # Tabela de Histórico de Ações (Mover, Renomear, Excluir, Auto-organizar)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS organize_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                action TEXT NOT NULL,
                source_path TEXT NOT NULL,
                dest_path TEXT,
                status TEXT NOT NULL,
                details TEXT
            )
        """)
        
        # Tabela de Configurações e Estado
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        
        # Índices para alta performance nas buscas e filtros
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_category ON files(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_modified ON files(modified_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_root ON files(is_root_file)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_duplicate ON files(is_duplicate)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_dir ON files(directory)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_path)")
        
        # Configurações padrão
        default_settings = {
            "daily_cron_time": "03:00",
            "auto_clean_temp": "true",
            "auto_organize_root": "false",
            "last_scan_time": "",
            "last_cron_run": "",
            "scan_status": "idle"
        }
        for k, v in default_settings.items():
            cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
            
        conn.commit()

def get_setting(key: str, default: str = "") -> str:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default

def set_setting(key: str, value: str):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
        conn.commit()

def log_action(action: str, source_path: str, dest_path: str = None, status: str = "success", details: str = ""):
    with get_connection() as conn:
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        cursor.execute("""
            INSERT INTO organize_history (timestamp, action, source_path, dest_path, status, details)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (now, action, source_path, dest_path, status, details))
        conn.commit()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
