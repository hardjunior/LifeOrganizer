# 📁 LifeOrganizer

> Sistema visual inteligente para gestão, organização e catalogação da sua vida digital e pastas com interface estilo **Google Fotos** e automação diária autônoma (**Cron / Windows Task Scheduler**).

---

## 🌟 Recursos Principais

1. **Interface Visual Estilo Google Fotos**:
   - Cards visuais fluidos com miniaturas em alta qualidade (WebP) para imagens e mídia.
   - Navegação por **Galeria**, **Linha do Tempo (Timeline por Mês/Ano)**, **Árvore Hierárquica Completa de Pastas** e **Central de Limpeza**.
   - Identificação visual de **Nome, Caminho Completo, Tamanho, Data de Modificação/Criação, Tipo e Criador/Proprietário Windows** (SIDs e Usuários).
   - Ações diretas em cada card: 👁️ Visualizar em Lightbox, ✏️ Renomear, 📁 Mover, 📂 Revelar no Explorer e 🗑️ Excluir (Lixeira Segura).
   - Suporte a seleção múltipla com barra flutuante de ações em lote.
   - Modo Claro e Modo Escuro nativos.

2. **Automação Diária Autônoma (Cron / Windows Task Scheduler)**:
   - Configuração com 1 clique direto na interface ou linha de comando.
   - Executa silenciosamente todos os dias no horário programado (ex: `03:00`).
   - Escaneia novas alterações, atualiza o índice, limpa arquivos temporários obsoletos e gera logs diários em `logs/daily_run.log`.
   - Compatível com o Agendador de Tarefas nativo do Windows e crontab clássico do Linux/WSL.

3. **Central de Limpeza & Vida Digital**:
   - Detecção de arquivos soltos na raiz de `D:\` com categorização automática para `D:\Imagem`, `D:\Documentos`, `D:\Videos`, `D:\musicas`, etc.
   - Detecção de arquivos duplicados através de hash MD5 de alta velocidade.
   - Lixeira com recuperação: todas as exclusões usam a API Shell do Windows com suporte a desfazer/recuperar.

---

## 🚀 Como Executar

### 1. Iniciar a Interface Visual
Dê dois cliques no atalho da Área de Trabalho ou no arquivo:
```cmd
D:\Projetos\LifeOrganizer\LifeOrganizer.vbs
```
Ou via linha de comando:
```powershell
cd D:\Projetos\LifeOrganizer
python -m uvicorn server:app --host 127.0.0.1 --port 8088
```
Acesse no seu navegador: **[http://localhost:8088](http://localhost:8088)**

---

### 2. Configurar Automação Diária (Cron)

#### Opção A: Pela Interface Web
Abra a aba **"Automação Diária (Cron)"**, defina o horário desejado (ex: `03:00`) e clique em **"Ativar no Windows"**.

#### Opção B: Por Linha de Comando (Windows)
```powershell
python D:\Projetos\LifeOrganizer\scheduler.py
```
Para agendar diariamente às 03:00:
```cmd
schtasks /Create /SC DAILY /TN "LifeOrganizerDaily" /TR "cmd.exe /c D:\Projetos\LifeOrganizer\run_daily.bat" /ST 03:00 /F
```

#### Opção C: Crontab (Linux / WSL)
Adicione no seu `crontab -e`:
```cron
0 3 * * * /usr/bin/python3 /mnt/d/Projetos/LifeOrganizer/run_daily.py >> /mnt/d/Projetos/LifeOrganizer/logs/daily_run.log 2>&1
```

---

## 📂 Estrutura de Arquivos

```text
D:\Projetos\LifeOrganizer\
├── config.py          # Configurações de pastas, regras e extensões
├── db.py              # Banco SQLite com índices otimizados
├── scanner.py         # Motor de escaneamento, miniaturas e extração de proprietário
├── organizer.py       # Funções de mover, renomear, lixeira segura e auto-organização
├── scheduler.py       # Gerenciador de agendamento (Windows Task / Linux Cron)
├── server.py          # API FastAPI e rotas de visualização
├── run_daily.py       # Script autônomo executado diariamente
├── run_daily.bat      # Script batch para o agendador do Windows
├── LifeOrganizer.vbs  # Lançador silencioso em modo aplicativo
├── LifeOrganizer_App.bat # Script de inicialização com Edge App Mode
├── start_app.bat      # Inicializador padrão
├── static/
│   ├── index.html     # Dashboard visual estilo Google Fotos & Mapa Mental
│   ├── style.css      # Estilização moderna e temas Claro/Escuro
│   └── app.js         # Lógica reativa da aplicação
├── logs/              # Logs de execução do cron diário
└── .thumbnails/       # Cache de miniaturas geradas
```
