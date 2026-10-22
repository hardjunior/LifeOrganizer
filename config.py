"""
LifeOrganizer - Configurações Gerais
"""
import os
from pathlib import Path

# Diretório base do aplicativo
BASE_DIR = Path(__file__).resolve().parent

# Banco de dados SQLite
DB_PATH = BASE_DIR / "life_organizer.db"

# Diretório de miniaturas de imagens
THUMBNAILS_DIR = BASE_DIR / ".thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

# Diretório de logs de execução
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Pastas padrão de escaneamento da vida e arquivos do usuário
DEFAULT_SCAN_FOLDERS = [
    r"D:\Desktop",
    r"D:\Documentos",
    r"D:\Downloads",
    r"D:\Imagem",
    r"D:\musicas",
    r"D:\Videos",
    r"D:\Backup",
    r"D:\Projetos",
    r"D:\tmp"
]

# Incluir arquivos soltos da raiz de D:\
SCAN_D_ROOT = True
D_ROOT = "D:\\"

# Pastas ignoradas por padrão (sistemas, binários pesados, ambientes de desenvolvimento)
IGNORED_DIRS = {
    "$RECYCLE.BIN",
    "System Volume Information",
    "Config.Msi",
    "Ubuntu",           # Sistema de arquivos Linux/WSL
    "nodejs",           # Runtime Node.js
    "ollama",           # Modelos de IA pesados
    "Programs",         # Instalações de programas
    "www",              # Servidor web local
    "_reversa_sdd",     # Pasta de sistema / reversa
    "node_modules",
    ".git",
    ".thumbnails",
    ".idea",
    ".vscode",
    "__pycache__",
    "AppData",
    "LifeOrganizer",     # Não escanear o próprio organizador recursivamente
    "venv",
    ".venv",
    "env",
    ".env",
    "dist",
    "build",
    "vendor"
}

# Categorias de arquivos por extensão
CATEGORY_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".svg", ".ico", ".raw", ".heic"},
    "video": {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".mpeg", ".3gp"},
    "audio": {".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus"},
    "document": {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".txt", ".csv", ".rtf", ".odt", ".epub"},
    "code": {".py", ".js", ".ts", ".html", ".css", ".json", ".xml", ".sql", ".ps1", ".bat", ".sh", ".c", ".cpp", ".java", ".php", ".yml", ".yaml", ".ini", ".reg"},
    "archive": {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso"},
    "executable": {".exe", ".msi", ".dll", ".jar"},
}

# Pastas de destino sugeridas para organização automática de arquivos soltos
DESTINATION_FOLDERS = {
    "image": r"D:\Imagem",
    "video": r"D:\Videos",
    "audio": r"D:\musicas",
    "document": r"D:\Documentos",
    "archive": r"D:\Backup\Compactados",
    "code": r"D:\Projetos\Scripts"
}

# Arquivos críticos da raiz que NUNCA devem ser movidos automaticamente
PROTECTED_ROOT_FILES = {
    "autorun.inf",
    "clean_safe.bat",
    "clean_safe.py"
}

# Regras de limpeza de arquivos temporários
TEMP_EXTENSIONS = {".tmp", ".temp", ".bak", ".dmp"}

# Porta do servidor web
SERVER_PORT = 8088
SERVER_HOST = "127.0.0.1"
