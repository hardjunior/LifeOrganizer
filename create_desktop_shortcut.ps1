$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "LifeOrganizer.lnk"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = '"D:\Projetos\LifeOrganizer\LifeOrganizer.vbs"'
$Shortcut.WorkingDirectory = "D:\Projetos\LifeOrganizer"
$Shortcut.Description = "LifeOrganizer - Gestao Visual da sua Vida & Arquivos"
$Shortcut.IconLocation = "shell32.dll, 4" # Icone clássico de pasta/organizador
$Shortcut.Save()

Write-Host "Atalho criado com sucesso na Area de Trabalho: $ShortcutPath"
