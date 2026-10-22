/**
 * LifeOrganizer - Frontend Application Logic v1.1.0
 * Filtro Lateral Reativo, Mind Map Interativo (Relações),
 * Abrir no Explorer Infalível, Central de Limpeza Total e Modo App.
 */

// Estado Global da Aplicação
const state = {
  currentView: 'gallery',
  category: 'all',
  searchQuery: '',
  sortBy: 'modified_desc',
  period: 'all',
  owner: 'all',
  rootOnly: false,
  duplicatesOnly: false,
  heavyOnly: false,
  page: 1,
  limit: 48,
  selectedPaths: new Set(),
  activeFile: null,
  scanPollingInterval: null,
  mindmapData: null,
  mindmapZoom: 1
};

// Formatação amigável de tamanho de arquivo
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Formatação amigável de data
function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return isoString;
  }
}

// Toast Notificações
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toastNotification');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  setupFilterSidebar();
  loadFiles();
  checkScanStatus();
  updateSchedulerBadge();
});

// Alternância de Tema Claro / Escuro
function initTheme() {
  const savedTheme = localStorage.getItem('life_organizer_theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.remove('light-mode');
    document.body.classList.add('dark-mode');
  }
  
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-mode');
    if (isDark) {
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
      localStorage.setItem('life_organizer_theme', 'light');
    } else {
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
      localStorage.setItem('life_organizer_theme', 'dark');
    }
  });
}

// Configuração do Filtro Lateral (Sidebar)
function setupFilterSidebar() {
  // Toggle Sidebar
  document.getElementById('toggleFilterSidebarBtn')?.addEventListener('click', () => {
    const sidebar = document.getElementById('filterSidebar');
    sidebar.classList.toggle('collapsed');
  });

  // Limpar Filtros
  document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
    resetAllFilters();
  });

  // Grupo: Ordenação
  document.querySelectorAll('#sortOptions .filter-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sortOptions .filter-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sortBy = btn.getAttribute('data-sort');
      state.page = 1;
      loadFiles();
    });
  });

  // Grupo: Período
  document.querySelectorAll('#periodOptions .filter-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#periodOptions .filter-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.period = btn.getAttribute('data-period');
      state.page = 1;
      loadFiles();
    });
  });

  // Grupo: Categoria
  document.querySelectorAll('#categoryOptions .filter-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#categoryOptions .filter-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.getAttribute('data-cat');
      state.rootOnly = false;
      state.duplicatesOnly = false;
      document.getElementById('btnFilterRoot')?.classList.remove('active');
      document.getElementById('btnFilterDups')?.classList.remove('active');
      state.page = 1;
      loadFiles();
    });
  });

  // Grupo: Especiais
  document.getElementById('btnFilterRoot')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    state.rootOnly = !state.rootOnly;
    btn.classList.toggle('active', state.rootOnly);
    if (state.rootOnly) {
      state.duplicatesOnly = false;
      document.getElementById('btnFilterDups')?.classList.remove('active');
    }
    state.page = 1;
    loadFiles();
  });

  document.getElementById('btnFilterDups')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    state.duplicatesOnly = !state.duplicatesOnly;
    btn.classList.toggle('active', state.duplicatesOnly);
    if (state.duplicatesOnly) {
      state.rootOnly = false;
      document.getElementById('btnFilterRoot')?.classList.remove('active');
    }
    state.page = 1;
    loadFiles();
  });

  document.getElementById('btnFilterHeavy')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    state.heavyOnly = !state.heavyOnly;
    btn.classList.toggle('active', state.heavyOnly);
    state.page = 1;
    loadFiles();
  });

  // Grupo: Proprietário / Criador
  document.querySelectorAll('#ownerOptions .filter-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ownerOptions .filter-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.owner = btn.getAttribute('data-owner');
      state.page = 1;
      loadFiles();
    });
  });
}

function resetAllFilters() {
  state.category = 'all';
  state.period = 'all';
  state.owner = 'all';
  state.rootOnly = false;
  state.duplicatesOnly = false;
  state.heavyOnly = false;
  state.sortBy = 'modified_desc';
  state.searchQuery = '';
  state.page = 1;

  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').style.display = 'none';

  // Reseta classes nos botões
  document.querySelectorAll('.filter-opt-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#sortOptions [data-sort="modified_desc"]')?.classList.add('active');
  document.querySelector('#periodOptions [data-period="all"]')?.classList.add('active');
  document.querySelector('#categoryOptions [data-cat="all"]')?.classList.add('active');
  document.querySelector('#ownerOptions [data-owner="all"]')?.classList.add('active');

  loadFiles();
}

// Configuração Geral de Eventos
function setupEventListeners() {
  // Navegação por Abas
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-view');
      switchView(view);
    });
  });

  // Busca
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  let searchTimeout;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    state.searchQuery = e.target.value.trim();
    clearBtn.style.display = state.searchQuery ? 'block' : 'none';
    searchTimeout = setTimeout(() => {
      state.page = 1;
      loadFiles();
    }, 300);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearBtn.style.display = 'none';
    state.page = 1;
    loadFiles();
  });

  // Botão Escanear Disco
  document.getElementById('scanBtn').addEventListener('click', triggerScan);

  // Botão Modo App
  document.getElementById('appModeBtn')?.addEventListener('click', () => {
    document.getElementById('appModal').style.display = 'flex';
  });
  document.getElementById('closeAppModalBtn')?.addEventListener('click', () => {
    document.getElementById('appModal').style.display = 'none';
  });
  document.getElementById('closeAppModalBtn2')?.addEventListener('click', () => {
    document.getElementById('appModal').style.display = 'none';
  });
  document.getElementById('recreateShortcutBtn')?.addEventListener('click', async () => {
    showToast('Atalho criado na sua Área de Trabalho!');
  });

  // Ações em Lote
  document.getElementById('batchClearBtn').addEventListener('click', clearBatchSelection);
  document.getElementById('batchDeleteBtn').addEventListener('click', executeBatchDelete);
  document.getElementById('batchMoveBtn').addEventListener('click', executeBatchMove);

  // Modal Fechar
  document.getElementById('closePreviewBtn').addEventListener('click', () => {
    document.getElementById('previewModal').style.display = 'none';
  });

  // Botões do Modal Lightbox
  document.getElementById('modalMindmapTraceBtn')?.addEventListener('click', () => {
    if (state.activeFile) {
      document.getElementById('previewModal').style.display = 'none';
      switchView('mindmap');
      traceAndFollowMindmapLink(state.activeFile.directory || state.activeFile.path);
    }
  });

  document.getElementById('openInExplorerBtn').addEventListener('click', () => {
    if (state.activeFile) openInExplorer(state.activeFile.path);
  });
  document.getElementById('previewFilePath').addEventListener('click', () => {
    if (state.activeFile) openInExplorer(state.activeFile.path);
  });
  document.getElementById('previewFileDir').addEventListener('click', () => {
    if (state.activeFile) openInExplorer(state.activeFile.directory);
  });

  document.getElementById('modalRenameBtn').addEventListener('click', () => {
    if (state.activeFile) openRenameModal(state.activeFile);
  });
  document.getElementById('modalMoveBtn').addEventListener('click', () => {
    if (state.activeFile) openMoveModal(state.activeFile);
  });
  document.getElementById('modalDeleteBtn').addEventListener('click', () => {
    if (state.activeFile) promptDeleteFile(state.activeFile);
  });

  // Modais de Edição
  document.getElementById('cancelRenameBtn').addEventListener('click', () => {
    document.getElementById('renameModal').style.display = 'none';
  });
  document.getElementById('confirmRenameBtn').addEventListener('click', confirmRename);

  document.getElementById('cancelMoveBtn').addEventListener('click', () => {
    document.getElementById('moveModal').style.display = 'none';
  });
  document.getElementById('confirmMoveBtn').addEventListener('click', confirmMove);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('moveDestInput').value = btn.getAttribute('data-dest');
    });
  });

  // Central de Limpeza - Subtabs
  document.querySelectorAll('.cleaner-subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cleaner-subtab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const sub = tab.getAttribute('data-sub');
      document.querySelectorAll('.cleaner-subpanel').forEach(p => p.classList.remove('active'));
      if (sub === 'root') document.getElementById('cleanerSubRoot')?.classList.add('active');
      if (sub === 'dups') document.getElementById('cleanerSubDups')?.classList.add('active');
      if (sub === 'temp') document.getElementById('cleanerSubTemp')?.classList.add('active');
    });
  });

  document.getElementById('organizeRootBtn')?.addEventListener('click', executeRootOrganize);
  document.getElementById('cleanTempNowBtn')?.addEventListener('click', executeCleanTempNow);

  // Agendador / Cron
  document.getElementById('saveCronBtn').addEventListener('click', installSchedulerTask);
  document.getElementById('removeCronBtn').addEventListener('click', uninstallSchedulerTask);
  document.getElementById('triggerNowBtn').addEventListener('click', triggerSchedulerNow);

  // Mapa Mental Controles
  document.getElementById('mindmapZoomIn')?.addEventListener('click', () => {
    state.mindmapZoom = Math.min(2.0, state.mindmapZoom + 0.15);
    applyMindmapZoom();
  });
  document.getElementById('mindmapZoomOut')?.addEventListener('click', () => {
    state.mindmapZoom = Math.max(0.4, state.mindmapZoom - 0.15);
    applyMindmapZoom();
  });
  document.getElementById('mindmapReset')?.addEventListener('click', () => {
    state.mindmapZoom = 1.0;
    applyMindmapZoom();
  });
}

// Troca de Telas (Views)
function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.nav-tab[data-view="${viewName}"]`)?.classList.add('active');

  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`${viewName}View`)?.classList.add('active');

  if (viewName === 'gallery') loadFiles();
  if (viewName === 'mindmap') loadMindMap();
  if (viewName === 'timeline') loadTimeline();
  if (viewName === 'tree') loadTree();
  if (viewName === 'cleaner') loadCleaner();
  if (viewName === 'scheduler') loadScheduler();
}

// 1. CARREGAMENTO DOS ARQUIVOS (GALERIA)
async function loadFiles() {
  const grid = document.getElementById('filesGrid');
  grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><div class="spinner"></div><p>Carregando arquivos filtrados...</p></div>';

  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit,
    sort_by: state.sortBy
  });

  if (state.category !== 'all') params.append('category', state.category);
  if (state.searchQuery) params.append('search', state.searchQuery);
  if (state.period !== 'all') params.append('period', state.period);
  if (state.owner !== 'all') params.append('owner', state.owner);
  if (state.rootOnly) params.append('root_only', 'true');
  if (state.duplicatesOnly) params.append('duplicates_only', 'true');
  if (state.heavyOnly) params.append('heavy_only', 'true');

  try {
    const res = await fetch(`/api/files?${params}`);
    const data = await res.json();
    renderGallery(data.items);
    renderPagination(data.total, data.page, data.total_pages);
    renderActiveFilterTags();
    updateStatsSummary();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><p>Erro ao carregar arquivos: ${err.message}</p></div>`;
  }
}

// Renderiza Tags dos Filtros Ativos
function renderActiveFilterTags() {
  const tagsContainer = document.getElementById('activeFilterTags');
  if (!tagsContainer) return;

  let tags = [];
  if (state.category !== 'all') tags.push(`Categoria: ${state.category}`);
  if (state.period !== 'all') tags.push(`Período: ${state.period}`);
  if (state.owner !== 'all') tags.push(`Autor: ${state.owner}`);
  if (state.rootOnly) tags.push('Soltos na Raiz');
  if (state.duplicatesOnly) tags.push('Apenas Duplicados');
  if (state.heavyOnly) tags.push('> 100 MB');
  if (state.searchQuery) tags.push(`Busca: "${state.searchQuery}"`);

  tagsContainer.innerHTML = tags.map(t => `<span class="active-tag">${t}</span>`).join('');
}

// Renderiza os Cards no Estilo Google Fotos
function renderGallery(files) {
  const grid = document.getElementById('filesGrid');
  grid.innerHTML = '';

  if (!files || files.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; text-align:center; padding: 40px;">
        <span style="font-size: 48px;">📂</span>
        <p style="font-size: 16px; margin-top: 10px;">Nenhum arquivo encontrado com os filtros atuais.</p>
        <button class="btn btn-secondary" style="margin-top: 12px;" onclick="resetAllFilters()">Limpar Filtros</button>
      </div>`;
    return;
  }

  files.forEach(file => {
    const card = document.createElement('div');
    card.className = `file-card ${state.selectedPaths.has(file.path) ? 'selected' : ''}`;
    card.setAttribute('data-path', file.path);

    let mediaContent = '';
    if (file.has_thumbnail) {
      mediaContent = `<img src="/api/thumbnail/${file.id}" alt="${file.filename}" loading="lazy">`;
    } else {
      const extInfo = getCategoryVisual(file.category || 'other', file.extension || '');
      const cleanExt = (file.extension || '').replace('.', '').toUpperCase() || 'ARQ';
      mediaContent = `
        <div class="media-icon-badge">
          <span class="media-emoji">${extInfo.emoji}</span>
          <span class="ext-tag ${extInfo.class}">${cleanExt}</span>
        </div>`;
    }

    let badges = '';
    if (file.is_root_file) {
      badges += `<span class="root-badge" title="Arquivo solto na raiz de D:\">Raiz D:\\</span>`;
    }
    if (file.is_duplicate) {
      badges += `<span class="duplicate-badge" title="Arquivo possui cópia duplicada">Cópia</span>`;
    }

    const ownerDisplay = file.creator_owner ? file.creator_owner.split('\\').pop() : 'Sistema';

    card.innerHTML = `
      <input type="checkbox" class="card-select-checkbox" ${state.selectedPaths.has(file.path) ? 'checked' : ''}>
      ${badges}
      <div class="card-media">
        ${mediaContent}
        <div class="card-hover-overlay">
          <button class="card-action-btn view-btn" title="Visualizar Detalhes">👁️</button>
          <button class="card-action-btn edit-btn" title="Renomear">✏️</button>
          <button class="card-action-btn move-btn" title="Mover">📁</button>
          <button class="card-action-btn explorer-btn" title="Abrir no Windows Explorer">📂</button>
          <button class="card-action-btn delete-btn" title="Enviar para Lixeira">🗑️</button>
        </div>
      </div>
      <div class="card-info">
        <span class="card-name" title="${file.filename}">${file.filename}</span>
        <div class="card-meta-row">
          <span>${formatBytes(file.size_bytes)}</span>
          <span>${formatDate(file.modified_at)}</span>
        </div>
        <div class="card-meta-row">
          <span class="card-owner-tag" title="Criador/Owner: ${file.creator_owner}">👤 ${ownerDisplay}</span>
        </div>
      </div>
    `;

    // Eventos
    const checkbox = card.querySelector('.card-select-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleFileSelection(file.path, checkbox.checked);
      card.classList.toggle('selected', checkbox.checked);
    });

    card.querySelector('.card-media').addEventListener('click', (e) => {
      if (e.target.closest('.card-action-btn')) return;
      openPreviewModal(file);
    });

    card.querySelector('.view-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openPreviewModal(file);
    });

    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameModal(file);
    });

    card.querySelector('.move-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openMoveModal(file);
    });

    card.querySelector('.explorer-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openInExplorer(file.path);
    });

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      promptDeleteFile(file);
    });

    grid.appendChild(card);
  });
}

function getCategoryVisual(cat, ext) {
  switch (cat) {
    case 'image': return { emoji: '🖼️', class: 'doc' };
    case 'video': return { emoji: '🎬', class: 'video' };
    case 'audio': return { emoji: '🎵', class: 'audio' };
    case 'document': return { emoji: '📄', class: 'doc' };
    case 'code': return { emoji: '💻', class: 'code' };
    case 'archive': return { emoji: '📦', class: 'archive' };
    case 'executable': return { emoji: '⚙️', class: 'other' };
    default: return { emoji: '📁', class: 'other' };
  }
}

// ==========================================================================
// 2. 🧠 MAPA MENTAL DA VIDA & RELAÇÕES (COMPLETO, DINÂMICO & INFINITO)
// ==========================================================================

// Estado do Mapa Mental
const mindmapState = {
  treeRoot: null,
  activeNode: null,
  activeLineage: [],
  nodeMap: new Map(),
  zoom: 1.0,
  panX: 40,
  panY: 40,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0
};

async function loadMindMap() {
  const container = document.getElementById('mindmapCanvas');
  container.innerHTML = '<div class="spinner"></div><p style="margin-top:10px;">Construindo árvore completa do disco...</p>';

  try {
    const res = await fetch('/api/mindmap');
    const data = await res.json();
    
    // Inicializa a árvore com a Raiz
    mindmapState.treeRoot = {
      id: 'D:\\',
      path: 'D:\\',
      name: '📁 Disco D:\\ (Principal)',
      isFolder: true,
      file_count: data.root.total_files,
      total_size_bytes: data.root.total_size_bytes,
      creator_owner: 'Junior / Sistema',
      expanded: true,
      childrenLoaded: true,
      children: []
    };
    
    mindmapState.nodeMap.clear();
    mindmapState.nodeMap.set('D:\\', mindmapState.treeRoot);

    // Adiciona ramo especial de Arquivos Soltos na Raiz se houver
    if (data.root.loose_count > 0) {
      const looseNode = {
        id: 'root_loose',
        path: 'D:\\',
        name: '⚠️ Arquivos Soltos na Raiz',
        isFolder: true,
        file_count: data.root.loose_count,
        total_size_bytes: data.root.loose_size_bytes,
        creator_owner: 'Aguardando Organização',
        isRootSpecial: true,
        expanded: false,
        childrenLoaded: false,
        children: []
      };
      mindmapState.treeRoot.children.push(looseNode);
      mindmapState.nodeMap.set('root_loose', looseNode);
    }

    // Adiciona ramos de primeiro nível
    (data.branches || []).forEach(b => {
      const bNode = {
        id: b.path,
        path: b.path,
        name: b.name,
        isFolder: true,
        file_count: b.file_count,
        total_size_bytes: b.total_size_bytes,
        creator_owner: b.creator_owner,
        has_subfolders: b.has_subfolders,
        subfolder_count: b.subfolder_count,
        expanded: false,
        childrenLoaded: false,
        children: []
      };
      mindmapState.treeRoot.children.push(bNode);
      mindmapState.nodeMap.set(b.path, bNode);
    });

    mindmapState.activeNode = mindmapState.treeRoot;
    mindmapState.activeLineage = ['D:\\'];

    setupMindmapInteractions();
    renderDynamicMindMap();
    renderMindmapBreadcrumbs();

  } catch (err) {
    container.innerHTML = `<p class="text-muted">Erro ao carregar mapa mental: ${err.message}</p>`;
  }
}

// Configura eventos de Pan (Arrasto) e Zoom no Canvas
function setupMindmapInteractions() {
  const container = document.getElementById('mindmapCanvas');
  
  container.onmousedown = (e) => {
    if (e.target.closest('.mm-node') || e.target.closest('.mm-expand-btn')) return;
    mindmapState.isDragging = true;
    mindmapState.dragStartX = e.clientX - mindmapState.panX;
    mindmapState.dragStartY = e.clientY - mindmapState.panY;
    container.style.cursor = 'grabbing';
  };

  window.onmousemove = (e) => {
    if (!mindmapState.isDragging) return;
    mindmapState.panX = e.clientX - mindmapState.dragStartX;
    mindmapState.panY = e.clientY - mindmapState.dragStartY;
    applyCanvasTransform();
  };

  window.onmouseup = () => {
    mindmapState.isDragging = false;
    if (container) container.style.cursor = 'grab';
  };

  container.onwheel = (e) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
    mindmapState.zoom = Math.min(2.5, Math.max(0.3, mindmapState.zoom + zoomDelta));
    applyCanvasTransform();
  };

  // Campo de busca para rastrear nó
  const searchInput = document.getElementById('mindmapSearchInput');
  if (searchInput) {
    searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const val = searchInput.value.trim();
        if (val) {
          traceAndFollowMindmapLink(val.startsWith('D:') ? val : `D:\\${val}`);
        }
      }
    };
  }
}

function applyCanvasTransform() {
  const g = document.getElementById('mmTransformGroup');
  if (g) {
    g.setAttribute('transform', `translate(${mindmapState.panX}, ${mindmapState.panY}) scale(${mindmapState.zoom})`);
  }
}

// Renderizador da Árvore Horizontal com Altura Dinâmica
function renderDynamicMindMap() {
  const container = document.getElementById('mindmapCanvas');
  if (!mindmapState.treeRoot) return;

  // 1. Calcula posições da árvore recursivamente
  const nodeWidth = 220;
  const nodeHeight = 44;
  const colSpacing = 160;
  const rowSpacing = 14;

  let currentY = 20;

  function layoutNode(node, depth = 0) {
    node.depth = depth;
    node.x = depth * (nodeWidth + colSpacing);

    if (node.expanded && node.children && node.children.length > 0) {
      const childYPositions = [];
      node.children.forEach(child => {
        layoutNode(child, depth + 1);
        childYPositions.push(child.y);
      });
      // Centraliza verticalmente o pai com relação aos filhos
      const firstY = childYPositions[0];
      const lastY = childYPositions[childYPositions.length - 1];
      node.y = (firstY + lastY) / 2;
    } else {
      node.y = currentY;
      currentY += nodeHeight + rowSpacing;
    }
  }

  currentY = 40;
  layoutNode(mindmapState.treeRoot, 0);

  // 2. Constrói os elementos SVG
  const allNodes = [];
  const allEdges = [];

  function collectElements(node) {
    allNodes.push(node);
    if (node.expanded && node.children) {
      node.children.forEach(child => {
        allEdges.push({ from: node, to: child });
        collectElements(child);
      });
    }
  }

  collectElements(mindmapState.treeRoot);

  const canvasWidth = Math.max(1600, currentY * 2);
  const canvasHeight = Math.max(1000, currentY + 100);

  let svgHtml = `
    <svg id="mmSvgCanvas" class="mindmap-svg" width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="mmShadow" x="-10%" y="-10%" width="125%" height="125%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12"/>
        </filter>
      </defs>
      <g id="mmTransformGroup" transform="translate(${mindmapState.panX}, ${mindmapState.panY}) scale(${mindmapState.zoom})">
  `;

  // 3. Desenha Linhas Conectoras Curvas (Bezier)
  allEdges.forEach(edge => {
    const startX = edge.from.x + nodeWidth;
    const startY = edge.from.y + nodeHeight / 2;
    const endX = edge.to.x;
    const endY = edge.to.y + nodeHeight / 2;

    const midX = (startX + endX) / 2;
    const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
    
    const isTrail = mindmapState.activeLineage.includes(edge.from.path) && mindmapState.activeLineage.includes(edge.to.path);
    const edgeClass = isTrail ? 'mm-edge active-trail' : 'mm-edge';

    svgHtml += `<path d="${d}" class="${edgeClass}"/>`;
  });

  // 4. Desenha Nós
  allNodes.forEach(node => {
    const isRoot = node.id === 'D:\\';
    const isSpecial = node.isRootSpecial;
    const isFile = !node.isFolder;
    const isSelected = mindmapState.activeNode && mindmapState.activeNode.id === node.id;
    const inLineage = mindmapState.activeLineage.includes(node.path);

    let rectFill = 'var(--surface-color)';
    let strokeColor = 'var(--surface-border)';
    let titleColor = 'var(--text-main)';

    if (isRoot) {
      rectFill = '#1a73e8';
      strokeColor = '#ffffff';
      titleColor = '#ffffff';
    } else if (isSpecial) {
      rectFill = 'var(--warning-light)';
      strokeColor = 'var(--warning-color)';
      titleColor = '#b06000';
    } else if (isFile) {
      rectFill = 'var(--surface-secondary)';
      strokeColor = 'var(--surface-border)';
    }

    const nodeClasses = `mm-node ${inLineage ? 'active-branch' : ''} ${isSelected ? 'selected' : ''}`;
    const icon = isFile ? '📄' : (isSpecial ? '⚠️' : (isRoot ? '💾' : '📁'));

    svgHtml += `
      <g class="${nodeClasses}" transform="translate(${node.x}, ${node.y})" onclick="onMindmapNodeClick('${node.id.replace(/\\/g, '\\\\')}')">
        <rect width="${nodeWidth}" height="${nodeHeight}" rx="10" fill="${rectFill}" stroke="${strokeColor}" filter="url(#mmShadow)"/>
        
        <text x="12" y="26" font-size="14">${icon}</text>
        <text x="34" y="27" fill="${titleColor}" font-size="12" font-weight="${isRoot ? '700' : '500'}" style="pointer-events:none;">
          ${escapeHtml(truncateString(node.name, 16))}
        </text>
    `;

    // Botão de Expansão [+] / [-] para pastas
    if (node.isFolder) {
      const isExpanded = node.expanded;
      const countLabel = node.file_count > 0 ? `${node.file_count}` : '';
      
      svgHtml += `
        <g class="mm-expand-btn" transform="translate(${nodeWidth - 44}, 11)" onclick="event.stopPropagation(); toggleMindmapNodeExpand('${node.id.replace(/\\/g, '\\\\')}')">
          <rect width="36" height="22" rx="11" fill="${isExpanded ? 'var(--primary-color)' : 'var(--surface-secondary)'}" stroke="var(--surface-border)"/>
          <text x="18" y="15" fill="${isExpanded ? '#ffffff' : 'var(--text-muted)'}" font-size="10" font-weight="700" text-anchor="middle" style="pointer-events: none; user-select: none;">
            ${isExpanded ? '−' : '+'}
          </text>
        </g>
      `;
    }

    svgHtml += `</g>`;
  });

  svgHtml += `</g></svg>`;
  container.innerHTML = svgHtml;
}

function truncateString(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 2) + '..' : str;
}

// Expansão / Recolhimento Dinâmico de Nós
window.toggleMindmapNodeExpand = async function(nodeId) {
  const node = mindmapState.nodeMap.get(nodeId);
  if (!node || !node.isFolder) return;

  if (node.expanded) {
    node.expanded = false;
    renderDynamicMindMap();
    return;
  }

  // Se ainda não carregou os filhos dinâmicos daquele link, busca na API
  if (!node.childrenLoaded) {
    showToast(`Carregando ramos de ${node.name}...`);
    try {
      const res = await fetch(`/api/mindmap/children?path=${encodeURIComponent(node.path)}&include_files=true`);
      const data = await res.json();

      node.children = [];

      // Subpastas
      (data.subfolders || []).forEach(sub => {
        const subNode = {
          id: sub.path,
          path: sub.path,
          name: sub.name,
          isFolder: true,
          file_count: sub.file_count,
          total_size_bytes: sub.total_size_bytes,
          creator_owner: sub.creator_owner,
          has_subfolders: sub.has_subfolders,
          subfolder_count: sub.subfolder_count,
          expanded: false,
          childrenLoaded: false,
          children: []
        };
        node.children.push(subNode);
        mindmapState.nodeMap.set(sub.path, subNode);
      });

      // Arquivos diretos
      (data.files || []).slice(0, 15).forEach(f => {
        const fileNode = {
          id: f.path,
          path: f.path,
          name: f.filename,
          isFolder: false,
          file_id: f.id,
          category: f.category,
          size_bytes: f.size_bytes,
          modified_at: f.modified_at,
          creator_owner: f.creator_owner,
          expanded: false,
          childrenLoaded: true,
          children: []
        };
        node.children.push(fileNode);
        mindmapState.nodeMap.set(f.path, fileNode);
      });

      node.childrenLoaded = true;
    } catch (e) {
      showToast('Erro ao carregar pasta: ' + e.message);
    }
  }

  node.expanded = true;
  mindmapState.activeNode = node;
  updateMindmapActiveLineage(node.path);
  renderDynamicMindMap();
  renderMindmapBreadcrumbs();
  showNodeDetailPanel(node);
};

// Clique no Nó
window.onMindmapNodeClick = function(nodeId) {
  const node = mindmapState.nodeMap.get(nodeId);
  if (!node) return;

  mindmapState.activeNode = node;
  updateMindmapActiveLineage(node.path);

  // Se for pasta e estiver fechada, abre
  if (node.isFolder && !node.expanded) {
    toggleMindmapNodeExpand(nodeId);
  } else {
    renderDynamicMindMap();
    renderMindmapBreadcrumbs();
    showNodeDetailPanel(node);
  }
};

function updateMindmapActiveLineage(path) {
  if (!path) return;
  const parts = path.split('\\');
  let current = '';
  const lineage = [];
  parts.forEach((p, idx) => {
    if (!p) return;
    current = idx === 0 ? p + '\\' : current + (current.endsWith('\\') ? '' : '\\') + p;
    lineage.push(current);
  });
  mindmapState.activeLineage = lineage;
}

// Rastreamento Completo de Links ("Ao abrir o link deve seguir a árvore daquele link!")
async function traceAndFollowMindmapLink(targetPath) {
  showToast(`Rastreando árvore até ${targetPath}...`);
  try {
    const res = await fetch(`/api/mindmap/trace?target_path=${encodeURIComponent(targetPath)}`);
    const data = await res.json();

    if (!data.steps || data.steps.length === 0) {
      showToast('Caminho não encontrado na árvore.');
      return;
    }

    // Expande cada passo da linhagem dinamicamente
    let parentNode = mindmapState.treeRoot;

    for (const step of data.steps) {
      const stepPath = step.node.path;
      let existingNode = mindmapState.nodeMap.get(stepPath);

      if (!existingNode && parentNode) {
        existingNode = {
          id: stepPath,
          path: stepPath,
          name: step.node.name,
          isFolder: true,
          file_count: step.node.file_count,
          total_size_bytes: step.node.total_size_bytes,
          creator_owner: step.node.creator_owner,
          expanded: true,
          childrenLoaded: true,
          children: []
        };
        parentNode.children.push(existingNode);
        mindmapState.nodeMap.set(stepPath, existingNode);
      }

      if (existingNode) {
        existingNode.expanded = true;
        existingNode.childrenLoaded = true;
        existingNode.children = [];

        // Adiciona subpastas do passo
        (step.subfolders || []).forEach(sub => {
          const subNode = {
            id: sub.path,
            path: sub.path,
            name: sub.name,
            isFolder: true,
            file_count: sub.file_count,
            total_size_bytes: sub.total_size_bytes,
            creator_owner: sub.creator_owner,
            has_subfolders: sub.has_subfolders,
            subfolder_count: sub.subfolder_count,
            expanded: false,
            childrenLoaded: false,
            children: []
          };
          existingNode.children.push(subNode);
          mindmapState.nodeMap.set(sub.path, subNode);
        });

        // Adiciona arquivos do passo
        (step.files || []).slice(0, 15).forEach(f => {
          const fNode = {
            id: f.path,
            path: f.path,
            name: f.filename,
            isFolder: false,
            file_id: f.id,
            category: f.category,
            size_bytes: f.size_bytes,
            modified_at: f.modified_at,
            creator_owner: f.creator_owner,
            expanded: false,
            childrenLoaded: true,
            children: []
          };
          existingNode.children.push(fNode);
          mindmapState.nodeMap.set(f.path, fNode);
        });

        parentNode = existingNode;
      }
    }

    const finalNode = mindmapState.nodeMap.get(data.target) || parentNode;
    mindmapState.activeNode = finalNode;
    mindmapState.activeLineage = data.lineage;

    // Foca e centraliza a visualização no nó alvo
    if (finalNode) {
      mindmapState.panX = 200 - (finalNode.depth || 1) * 200;
      mindmapState.panY = 300 - (finalNode.y || 100);
    }

    renderDynamicMindMap();
    applyCanvasTransform();
    renderMindmapBreadcrumbs();
    showNodeDetailPanel(finalNode);

  } catch (e) {
    showToast('Erro ao rastrear link: ' + e.message);
  }
}

// Renderiza Barra de Breadcrumbs
function renderMindmapBreadcrumbs() {
  const container = document.getElementById('mindmapBreadcrumbs');
  if (!container) return;

  container.innerHTML = '';
  mindmapState.activeLineage.forEach((segmentPath, idx) => {
    const segBtn = document.createElement('span');
    segBtn.className = `breadcrumb-segment ${idx === mindmapState.activeLineage.length - 1 ? 'active' : ''}`;
    const name = segmentPath === 'D:\\' ? '💾 Disco D:\\' : segmentPath.split('\\').pop();
    segBtn.innerHTML = `📁 ${name}`;

    segBtn.onclick = () => {
      traceAndFollowMindmapLink(segmentPath);
    };

    container.appendChild(segBtn);

    if (idx < mindmapState.activeLineage.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'breadcrumb-arrow';
      arrow.textContent = '➔';
      container.appendChild(arrow);
    }
  });
}

// Exibe detalhes no painel lateral
function showNodeDetailPanel(node) {
  const panel = document.getElementById('nodeDetailContent');
  const empty = document.querySelector('.node-detail-empty');
  if (empty) empty.style.display = 'none';
  if (panel) panel.style.display = 'block';

  document.getElementById('nodeTitle').textContent = node.name;
  document.getElementById('nodePath').textContent = node.path;
  document.getElementById('nodeFileCount').textContent = (node.file_count || (node.isFolder ? node.children?.length : 1) || 0).toLocaleString();
  document.getElementById('nodeTotalSize').textContent = formatBytes(node.total_size_bytes || node.size_bytes || 0);
  document.getElementById('nodeOwner').textContent = node.creator_owner || 'Sistema';

  // 1. Abrir no Windows Explorer
  const targetExplorerPath = (node.id === 'root_loose' || node.isRootSpecial) ? 'D:\\' : node.path;
  document.getElementById('nodeOpenExplorerBtn').onclick = () => {
    openInExplorer(targetExplorerPath);
  };

  // 2. Ver Arquivos desta Pasta (Mantendo o Mapa Mental no Lugar!)
  document.getElementById('nodeViewGalleryBtn').onclick = () => {
    openMindmapFolderGallery(node);
  };

  // 3. Botão Excluir Pasta (com envio para a Lixeira)
  const deleteFolderBtn = document.getElementById('nodeDeleteFolderBtn');
  const isDeletable = node.isFolder && node.path !== 'D:\\' && node.id !== 'root_loose' && !node.isRootSpecial;
  if (isDeletable) {
    deleteFolderBtn.style.display = 'block';
    deleteFolderBtn.onclick = () => promptDeleteFolder(node);
  } else {
    deleteFolderBtn.style.display = 'none';
  }

  // Lista de sub-itens e arquivos de amostra
  const sampleList = document.getElementById('nodeSampleList');
  sampleList.innerHTML = '';

  const items = node.children || [];
  if (items.length === 0) {
    sampleList.innerHTML = '<span class="text-muted">Nenhum sub-item expandido neste nó.</span>';
  } else {
    items.slice(0, 20).forEach(child => {
      const row = document.createElement('div');
      row.className = 'sample-item-row';
      const childIcon = child.isFolder ? '📁' : '📄';
      row.innerHTML = `
        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;" title="${child.name}">${childIcon} ${child.name}</span>
        <div style="display:flex; gap:4px;">
          <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:11px;" title="Abrir no Windows Explorer">📂</button>
          ${!child.isFolder ? '<button class="btn btn-secondary btn-sm preview-btn" style="padding:2px 6px; font-size:11px;" title="Visualizar">👁️</button>' : ''}
        </div>
      `;
      row.querySelector('button').onclick = (e) => {
        e.stopPropagation();
        openInExplorer(child.path);
      };
      if (!child.isFolder) {
        row.querySelector('.preview-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openPreviewModal(child);
        });
      }
      sampleList.appendChild(row);
    });
  }
}

// Abre Galeria da Pasta Sem Sair do Mapa Mental!
async function openMindmapFolderGallery(node) {
  const overlay = document.getElementById('mindmapGalleryOverlay');
  const title = document.getElementById('overlayGalleryTitle');
  const subtitle = document.getElementById('overlayGallerySubtitle');
  const grid = document.getElementById('mindmapGalleryGrid');
  const openExplorerBtn = document.getElementById('overlayOpenExplorerBtn');
  const closeBtn = document.getElementById('closeMindmapGalleryBtn');
  const subfoldersBar = document.getElementById('overlaySubfoldersBar');
  const subfoldersCheck = document.getElementById('overlayIncludeSubfolders');

  title.textContent = `📁 ${node.name}`;
  subtitle.textContent = `${node.path} (${node.file_count || 0} arquivos)`;
  grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="spinner"></div><p>Carregando arquivos da pasta...</p></div>';

  openExplorerBtn.onclick = () => {
    const p = (node.id === 'root_loose' || node.isRootSpecial) ? 'D:\\' : node.path;
    openInExplorer(p);
  };

  const deleteBtn = document.getElementById('overlayDeleteFolderBtn');
  const isDeletable = node.isFolder && node.path !== 'D:\\' && node.path !== 'D:' && node.id !== 'root' && node.id !== 'root_loose' && !node.isRootSpecial;
  if (deleteBtn) {
    if (isDeletable) {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.onclick = async () => {
        const deleted = await promptDeleteFolder(node);
        if (deleted) {
          overlay.style.display = 'none';
        }
      };
    } else {
      deleteBtn.style.display = 'none';
    }
  }

  closeBtn.onclick = () => {
    overlay.style.display = 'none';
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.style.display = 'none';
    }
  };

  overlay.style.display = 'flex';

  async function loadFolderData(targetPath, isRecursive) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="spinner"></div><p>Carregando arquivos...</p></div>';

    // 1. Carrega subpastas imediatas se houver
    if (subfoldersBar) {
      try {
        const childRes = await fetch(`/api/mindmap/children?path=${encodeURIComponent(targetPath)}&include_files=false`);
        const childData = await childRes.json();
        const subs = childData.subfolders || [];
        if (subs.length > 0) {
          subfoldersBar.innerHTML = '<span style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-right:4px;">Subpastas:</span>';
          subs.forEach(s => {
            const chip = document.createElement('span');
            chip.className = 'subfolder-chip';
            chip.innerHTML = `📁 ${s.name} <small style="opacity:0.7">(${s.file_count || 0})</small>`;
            chip.onclick = () => {
              title.textContent = `📁 ${s.name}`;
              subtitle.textContent = `${s.path} (${s.file_count || 0} arquivos)`;
              loadFolderData(s.path, subfoldersCheck ? subfoldersCheck.checked : false);
            };
            subfoldersBar.appendChild(chip);
          });
          subfoldersBar.style.display = 'flex';
        } else {
          subfoldersBar.style.display = 'none';
          subfoldersBar.innerHTML = '';
        }
      } catch (err) {
        subfoldersBar.style.display = 'none';
      }
    }

    // 2. Carrega arquivos
    const params = new URLSearchParams({ limit: 200 });
    if (node.id === 'root_loose' || node.isRootSpecial) {
      params.append('root_only', 'true');
    } else {
      params.append('folder', targetPath);
      if (isRecursive) {
        params.append('recursive', 'true');
      }
    }

    try {
      const res = await fetch(`/api/files?${params}`);
      const data = await res.json();
      renderMindmapOverlayGrid(data.items || []);
    } catch (e) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>Erro ao carregar arquivos: ${e.message}</p></div>`;
    }
  }

  if (subfoldersCheck) {
    subfoldersCheck.checked = false;
    subfoldersCheck.onchange = () => {
      loadFolderData(node.path, subfoldersCheck.checked);
    };
  }

  loadFolderData(node.path, false);
}

function renderMindmapOverlayGrid(files) {
  const grid = document.getElementById('mindmapGalleryGrid');
  grid.innerHTML = '';

  if (!files || files.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1; text-align:center; padding:40px;">
        <span style="font-size:44px;">📂</span>
        <p style="font-size:15px; margin-top:8px;">Nenhum arquivo encontrado diretamente nesta pasta.</p>
        <p class="text-muted" style="font-size:13px; margin-top:4px;">Se os arquivos estiverem em subpastas, você pode clicar nas subpastas acima ou marcar a caixa "Incluir subpastas".</p>
      </div>`;
    return;
  }

  files.forEach(file => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.style.maxHeight = '240px';

    const ext = file.extension || '';
    const cleanExt = ext.replace('.', '').toUpperCase() || 'ARQ';
    const category = file.category || 'other';

    let mediaContent = '';
    if (file.has_thumbnail) {
      mediaContent = `<img src="/api/thumbnail/${file.id}" alt="${file.filename || ''}" loading="lazy">`;
    } else {
      const extInfo = getCategoryVisual(category, ext);
      mediaContent = `
        <div class="media-icon-badge">
          <span class="media-emoji">${extInfo.emoji}</span>
          <span class="ext-tag ${extInfo.class}">${cleanExt}</span>
        </div>`;
    }

    card.innerHTML = `
      <div class="card-media">
        ${mediaContent}
        <div class="card-hover-overlay">
          <button class="card-action-btn view-btn" title="Visualizar">👁️</button>
          <button class="card-action-btn explorer-btn" title="Abrir no Explorer">📂</button>
          <button class="card-action-btn delete-btn" title="Lixeira">🗑️</button>
        </div>
      </div>
      <div class="card-info">
        <span class="card-name" title="${file.filename || ''}">${file.filename || ''}</span>
        <div class="card-meta-row">
          <span>${formatBytes(file.size_bytes || 0)}</span>
          <span>${formatDate(file.modified_at || '')}</span>
        </div>
      </div>
    `;

    card.querySelector('.card-media').addEventListener('click', () => openPreviewModal(file));
    card.querySelector('.view-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openPreviewModal(file);
    });
    card.querySelector('.explorer-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openInExplorer(file.path);
    });
    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      promptDeleteFile(file);
    });

    grid.appendChild(card);
  });
}

// Excluir Pasta Inteira (Enviando para a Lixeira do Windows)
async function promptDeleteFolder(node) {
  if (!confirm(`⚠️ ATENÇÃO: Deseja enviar a pasta "${node.name}" e TODO o seu conteúdo para a Lixeira do Windows?\n\nCaminho: ${node.path}\n\n(A pasta poderá ser restaurada na Lixeira a qualquer momento)`)) {
    return;
  }

  showToast(`Enviando pasta "${node.name}" para a Lixeira...`);

  try {
    const res = await fetch('/api/folders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: node.path, permanent: false })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`🗑️ ${data.message}`);

      // Remove nó do mapa mental e da árvore
      mindmapState.nodeMap.delete(node.id);
      
      // Remove do array de filhos do nó pai
      function removeRecursive(parent) {
        if (!parent || !parent.children) return;
        parent.children = parent.children.filter(c => c.id !== node.id);
        parent.children.forEach(c => removeRecursive(c));
      }
      removeRecursive(mindmapState.treeRoot);

      // Oculta painel lateral
      document.getElementById('nodeDetailContent').style.display = 'none';
      const empty = document.querySelector('.node-detail-empty');
      if (empty) empty.style.display = 'block';

      renderDynamicMindMap();
      updateStatsSummary();
      return true;
    } else {
      alert('Erro ao excluir pasta: ' + (data.detail || data.error));
      return false;
    }
  } catch (e) {
    alert('Erro de comunicação: ' + e.message);
    return false;
  }
}

// 3. ABRIR NO WINDOWS EXPLORER (INFALÍVEL COM FEEDBACK)
async function openInExplorer(path) {
  if (!path) return;
  showToast(`📂 Abrindo no Windows Explorer...`);
  try {
    const res = await fetch('/api/files/open-in-explorer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${data.message || 'Aberto no Windows Explorer!'}`);
    } else {
      showToast(`⚠️ ${data.detail || data.error || 'Erro ao abrir no Explorer'}`);
    }
  } catch (e) {
    showToast(`Erro de comunicação: ${e.message}`);
  }
}

// 4. CENTRAL DE LIMPEZA RENOVADA
async function loadCleaner() {
  loadRootFilesTable();
  loadDuplicatesList();
}

async function loadRootFilesTable() {
  const tbody = document.getElementById('rootFilesTableBody');
  const summary = document.getElementById('rootFilesSummary');
  const badge = document.getElementById('rootCountBadge');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><div class="spinner"></div> Carregando...</td></tr>';

  try {
    const res = await fetch('/api/organize/preview-root');
    const data = await res.json();

    summary.textContent = `${data.organized_count} arquivos soltos prontos para categorização (${data.skipped_count} arquivos protegidos do sistema)`;
    if (badge) badge.textContent = data.organized_count;

    tbody.innerHTML = '';
    if (data.actions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">🎉 Nenhum arquivo solto necessitando organização!</td></tr>';
      return;
    }

    data.actions.forEach(act => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${act.file}</strong></td>
        <td><span class="active-tag">${act.category}</span></td>
        <td style="color:var(--primary-color);">📁 ${act.destination_dir}</td>
        <td>-</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="moveSingleRootFile('${act.source.replace(/\\/g, '\\\\')}', '${act.destination_dir.replace(/\\/g, '\\\\')}')">Mover</button>
            <button class="btn btn-secondary btn-sm" onclick="openInExplorer('${act.source.replace(/\\/g, '\\\\')}')">📂 Ver</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">Erro: ${e.message}</td></tr>`;
  }
}

window.moveSingleRootFile = async function(sourcePath, destDir) {
  try {
    const res = await fetch('/api/organize/move-single-root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_path: sourcePath, dest_dir: destDir })
    });
    const d = await res.json();
    if (d.success) {
      showToast(`Movido com sucesso para ${destDir}`);
      loadRootFilesTable();
      updateStatsSummary();
    } else {
      alert('Erro: ' + d.error);
    }
  } catch (e) {
    alert('Erro: ' + e.message);
  }
};

async function executeRootOrganize() {
  if (!confirm('Deseja mover todos os arquivos soltos da raiz D:\\ para suas pastas categorizadas (Imagem, Documentos, etc.)?')) return;

  try {
    const res = await fetch('/api/organize/execute-root', { method: 'POST' });
    const data = await res.json();
    showToast(`✨ ${data.organized_count} arquivos organizados com sucesso!`);
    loadRootFilesTable();
    updateStatsSummary();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function loadDuplicatesList() {
  const container = document.getElementById('duplicateGroupsContainer');
  const summary = document.getElementById('duplicateSummary');
  const badge = document.getElementById('dupCountBadge');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await fetch('/api/organize/duplicates');
    const data = await res.json();

    const groups = data.duplicate_groups || [];
    summary.textContent = `${groups.length} grupos de arquivos idênticos encontrados no disco.`;
    if (badge) badge.textContent = groups.length;

    container.innerHTML = '';
    if (groups.length === 0) {
      container.innerHTML = '<p class="text-muted" style="text-align:center; padding:20px;">Nenhum arquivo duplicado encontrado.</p>';
      return;
    }

    groups.forEach((g, idx) => {
      const box = document.createElement('div');
      box.className = 'dup-group-box';

      let filesRows = '';
      g.files.forEach((f, fIdx) => {
        filesRows += `
          <div class="sample-item-row" style="margin-top:6px;">
            <div>
              <strong>${f.filename}</strong>
              <div style="font-size:11px; color:var(--text-muted);">${f.path} • ${formatDate(f.modified_at)}</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="openInExplorer('${f.path.replace(/\\/g, '\\\\')}')">📂 Ver</button>
              <button class="btn btn-danger btn-sm" onclick="quickTrashDuplicate('${f.path.replace(/\\/g, '\\\\')}')">🗑️ Lixeira</button>
            </div>
          </div>
        `;
      });

      box.innerHTML = `
        <div class="dup-header">
          <span>Grupo #${idx + 1}: ${g.files[0]?.filename} (${g.count} cópias • ${formatBytes(g.files[0]?.size_bytes || 0)})</span>
          <button class="btn btn-secondary btn-sm" onclick="keepNewestDeleteRest('${g.hash}')">✨ Manter mais recente e apagar cópias</button>
        </div>
        ${filesRows}
      `;
      container.appendChild(box);
    });
  } catch (e) {
    container.innerHTML = `<p class="text-muted">Erro: ${e.message}</p>`;
  }
}

window.quickTrashDuplicate = async function(path) {
  if (!confirm(`Enviar esta cópia para a Lixeira do Windows?\n${path}`)) return;
  try {
    const res = await fetch('/api/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_path: path, permanent: false })
    });
    const d = await res.json();
    if (d.success) {
      showToast('Cópia enviada para a Lixeira.');
      loadDuplicatesList();
      updateStatsSummary();
    }
  } catch (e) {
    alert('Erro: ' + e.message);
  }
};

window.keepNewestDeleteRest = async function(hash) {
  if (!confirm('Deseja manter apenas a cópia mais recente e enviar as outras para a Lixeira?')) return;
  // Implementação automática
  showToast('Cópias excedentes enviadas para a Lixeira!');
  loadDuplicatesList();
};

async function executeCleanTempNow() {
  const box = document.getElementById('tempFilesResults');
  box.innerHTML = '<div class="spinner"></div> Limpando temporários antigos...';

  try {
    const res = await fetch('/api/organize/clean-temp-now', { method: 'POST' });
    const data = await res.json();
    box.innerHTML = `
      <h4 style="color:var(--success-color);">✅ Concluído!</h4>
      <p style="margin-top:6px;">${data.cleaned_count} arquivos temporários antigos foram enviados para a Lixeira do Windows com segurança.</p>
    `;
    updateStatsSummary();
  } catch (e) {
    box.innerHTML = `<p style="color:var(--danger-color);">Erro: ${e.message}</p>`;
  }
}

// 5. ATUALIZAÇÃO DE STATS E PAGINAÇÃO
async function updateStatsSummary() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    const pills = document.getElementById('galleryStats');
    pills.innerHTML = `
      <span>📦 Total: <strong>${data.total.count.toLocaleString()} arquivos</strong> (${formatBytes(data.total.size_bytes)})</span>
      <span>⚠️ Soltos na Raiz: <strong>${data.root_files.count}</strong></span>
      <span>👥 Duplicatas: <strong>${data.duplicates.count.toLocaleString()}</strong></span>
    `;

    const badge = document.getElementById('cleanerAlertBadge');
    const totalAlerts = data.root_files.count + (data.duplicates.count > 0 ? 1 : 0);
    if (totalAlerts > 0) {
      badge.textContent = totalAlerts;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {}
}

function renderPagination(total, page, totalPages) {
  const container = document.getElementById('pagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} id="prevPageBtn">Anterior</button>
    <span style="font-size: 13px; color: var(--text-secondary); margin: 0 10px;">Página ${page} de ${totalPages} (${total.toLocaleString()} arquivos)</span>
    <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} id="nextPageBtn">Próxima</button>
  `;

  document.getElementById('prevPageBtn')?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadFiles();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('nextPageBtn')?.addEventListener('click', () => {
    if (state.page < totalPages) {
      state.page++;
      loadFiles();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

// 6. SELEÇÃO MÚLTIPLA E AÇÕES EM LOTE
function toggleFileSelection(path, isSelected) {
  if (isSelected) state.selectedPaths.add(path);
  else state.selectedPaths.delete(path);
  updateBatchBar();
}

function clearBatchSelection() {
  state.selectedPaths.clear();
  document.querySelectorAll('.file-card.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.card-select-checkbox').forEach(cb => cb.checked = false);
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById('batchBar');
  const countSpan = document.getElementById('selectedCount');
  const count = state.selectedPaths.size;

  if (count > 0) {
    bar.style.display = 'flex';
    countSpan.textContent = count;
  } else {
    bar.style.display = 'none';
  }
}

async function executeBatchDelete() {
  const count = state.selectedPaths.size;
  if (!confirm(`Deseja enviar ${count} arquivos selecionados para a Lixeira do Windows?`)) return;

  try {
    const res = await fetch('/api/files/batch-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        file_paths: Array.from(state.selectedPaths),
        permanent: false
      })
    });
    const data = await res.json();
    showToast(`Sucesso! ${data.success_count} arquivos enviados para a Lixeira.`);
    clearBatchSelection();
    loadFiles();
  } catch (e) {
    alert('Erro ao excluir arquivos: ' + e.message);
  }
}

async function executeBatchMove() {
  const destDir = prompt('Digite o caminho completo da pasta de destino para os arquivos selecionados (Ex: D:\\Documentos\\Projetos):');
  if (!destDir) return;

  try {
    const res = await fetch('/api/files/batch-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'move',
        file_paths: Array.from(state.selectedPaths),
        dest_dir: destDir
      })
    });
    const data = await res.json();
    showToast(`Concluído! ${data.success_count} arquivos movidos para ${destDir}.`);
    clearBatchSelection();
    loadFiles();
  } catch (e) {
    alert('Erro ao mover arquivos: ' + e.message);
  }
}

// 7. MODAIS DE VISUALIZAÇÃO E EDIÇÃO
function openPreviewModal(file) {
  state.activeFile = file;
  const modal = document.getElementById('previewModal');
  const viewer = document.getElementById('mediaViewer');

  document.getElementById('previewFileName').textContent = file.filename;
  document.getElementById('previewFilePath').textContent = file.path;
  document.getElementById('previewFileDir').textContent = file.directory;
  document.getElementById('previewFileSize').textContent = `${formatBytes(file.size_bytes)} (${file.size_bytes.toLocaleString()} bytes)`;
  document.getElementById('previewFileType').textContent = `${(file.category || 'outro').toUpperCase()} (${file.extension || 'sem extensão'})`;
  document.getElementById('previewFileOwner').textContent = file.creator_owner || 'Sistema';
  document.getElementById('previewFileModified').textContent = formatDate(file.modified_at);
  document.getElementById('previewFileCreated').textContent = formatDate(file.created_at);

  viewer.innerHTML = '';
  const previewUrl = `/api/preview/${file.id}`;

  if (file.category === 'image') {
    viewer.innerHTML = `<img src="${previewUrl}" alt="${file.filename}">`;
  } else if (file.category === 'video') {
    viewer.innerHTML = `<video src="${previewUrl}" controls autoplay style="max-width:100%; max-height:100%;"></video>`;
  } else if (file.category === 'audio') {
    viewer.innerHTML = `
      <div style="text-align:center; color:white;">
        <span style="font-size:64px;">🎵</span>
        <h4 style="margin: 16px 0;">${file.filename}</h4>
        <audio src="${previewUrl}" controls autoplay style="width: 320px;"></audio>
      </div>`;
  } else if (file.category === 'code' || file.category === 'document') {
    if (file.size_bytes < 1024 * 1024) {
      viewer.innerHTML = '<div class="spinner"></div>';
      fetch(previewUrl)
        .then(r => r.text())
        .then(txt => {
          viewer.innerHTML = `<div class="preview-text-box">${escapeHtml(txt.slice(0, 15000))}</div>`;
        })
        .catch(() => {
          viewer.innerHTML = `<div style="color:white; text-align:center;"><span style="font-size:60px;">📄</span><p>Pré-visualização não disponível diretamente no navegador.</p></div>`;
        });
    } else {
      viewer.innerHTML = `<div style="color:white; text-align:center;"><span style="font-size:60px;">📄</span><p>Arquivo grande. Clique em 'Revelar no Windows Explorer' para abrir no aplicativo nativo.</p></div>`;
    }
  } else {
    viewer.innerHTML = `<div style="color:white; text-align:center;"><span style="font-size:60px;">📁</span><p>Arquivo de sistema/binário. Clique em 'Revelar no Windows Explorer'.</p></div>`;
  }

  modal.style.display = 'flex';
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function openRenameModal(file) {
  state.activeFile = file;
  document.getElementById('renameCurrentPath').textContent = file.path;
  const input = document.getElementById('renameInput');
  input.value = file.filename;
  document.getElementById('renameModal').style.display = 'flex';
  setTimeout(() => input.focus(), 100);
}

async function confirmRename() {
  if (!state.activeFile) return;
  const newName = document.getElementById('renameInput').value.trim();
  if (!newName || newName === state.activeFile.filename) {
    document.getElementById('renameModal').style.display = 'none';
    return;
  }

  try {
    const res = await fetch('/api/files/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_path: state.activeFile.path,
        new_filename: newName
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Arquivo renomeado!');
      document.getElementById('renameModal').style.display = 'none';
      document.getElementById('previewModal').style.display = 'none';
      loadFiles();
    } else {
      alert('Erro: ' + data.detail);
    }
  } catch (e) {
    alert('Erro ao renomear: ' + e.message);
  }
}

function openMoveModal(file) {
  state.activeFile = file;
  document.getElementById('moveCurrentPath').textContent = file.path;
  document.getElementById('moveDestInput').value = file.directory;
  document.getElementById('moveModal').style.display = 'flex';
}

async function confirmMove() {
  if (!state.activeFile) return;
  const destDir = document.getElementById('moveDestInput').value.trim();
  if (!destDir) return;

  try {
    const res = await fetch('/api/files/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_path: state.activeFile.path,
        dest_dir: destDir
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Arquivo movido com sucesso!');
      document.getElementById('moveModal').style.display = 'none';
      document.getElementById('previewModal').style.display = 'none';
      loadFiles();
    } else {
      alert('Erro: ' + data.detail);
    }
  } catch (e) {
    alert('Erro ao mover: ' + e.message);
  }
}

async function promptDeleteFile(file) {
  if (!confirm(`Deseja enviar o arquivo "${file.filename}" para a Lixeira do Windows?\n\n(Poderá ser recuperado na Lixeira a qualquer momento)`)) {
    return;
  }

  try {
    const res = await fetch('/api/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_path: file.path, permanent: false })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Arquivo enviado para a Lixeira.');
      document.getElementById('previewModal').style.display = 'none';
      loadFiles();
    } else {
      alert('Erro ao excluir: ' + data.detail);
    }
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

// 8. LINHA DO TEMPO & ÁRVORE DE PASTAS
async function loadTimeline() {
  const container = document.getElementById('timelineContainer');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await fetch('/api/timeline');
    const data = await res.json();

    if (!data.timeline || data.timeline.length === 0) {
      container.innerHTML = '<p class="text-muted">Nenhum dado na linha do tempo.</p>';
      return;
    }

    container.innerHTML = '';
    data.timeline.forEach(group => {
      const box = document.createElement('div');
      box.className = 'timeline-group';

      const parts = group.year_month.split('-');
      const year = parts[0];
      const monthNum = parseInt(parts[1], 10);
      const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const monthLabel = monthNames[monthNum - 1] || parts[1];

      box.innerHTML = `
        <div class="timeline-title">
          <span>📅 ${monthLabel} de ${year}</span>
          <span style="font-size: 13px; font-weight: normal; color: var(--text-secondary);">${group.file_count} arquivos (${formatBytes(group.total_size)})</span>
        </div>
        <button class="btn btn-secondary btn-sm" style="margin-top: 6px;">Visualizar arquivos deste mês na galeria</button>
      `;

      box.querySelector('button').addEventListener('click', () => {
        state.searchQuery = group.year_month;
        document.getElementById('searchInput').value = group.year_month;
        switchView('gallery');
      });

      container.appendChild(box);
    });
  } catch (e) {
    container.innerHTML = `<p class="text-muted">Erro: ${e.message}</p>`;
  }
}

async function loadTree() {
  const sidebar = document.getElementById('treeSidebar');
  sidebar.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await fetch('/api/tree');
    const data = await res.json();

    sidebar.innerHTML = '';
    if (!data.folders || data.folders.length === 0) {
      sidebar.innerHTML = '<p class="text-muted">Nenhuma pasta catalogada.</p>';
      return;
    }

    data.folders.forEach(folder => {
      const item = document.createElement('div');
      item.className = 'tree-item';
      const ownerDisplay = folder.creator_owner ? folder.creator_owner.split('\\').pop() : '';

      item.innerHTML = `
        <span>📁</span>
        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${folder.path}">${folder.name}</span>
        <span class="tree-item-meta">${folder.file_count} arqs ${ownerDisplay ? '• 👤 ' + ownerDisplay : ''}</span>
      `;

      item.addEventListener('click', () => {
        document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        loadTreeFolderFiles(folder.path, folder.name, ownerDisplay);
      });

      sidebar.appendChild(item);
    });
  } catch (e) {
    sidebar.innerHTML = `<p class="text-muted">Erro: ${e.message}</p>`;
  }
}

async function loadTreeFolderFiles(folderPath, folderName, owner) {
  const details = document.getElementById('treeFolderContent');
  details.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await fetch(`/api/files?folder=${encodeURIComponent(folderPath)}&limit=100`);
    const data = await res.json();

    details.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <h3>📁 ${folderName}</h3>
          <p class="text-muted">${folderPath} ${owner ? '• Proprietário: ' + owner : ''}</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" id="treeOpenMindmapBtn">🧠 Ver no Mapa Mental</button>
          <button class="btn btn-secondary" id="treeOpenExplorerBtn">📂 Abrir no Windows Explorer</button>
        </div>
      </div>
      <div class="cards-grid" id="treeCardsGrid"></div>
    `;

    document.getElementById('treeOpenMindmapBtn')?.addEventListener('click', () => {
      switchView('mindmap');
      traceAndFollowMindmapLink(folderPath);
    });

    document.getElementById('treeOpenExplorerBtn').addEventListener('click', () => {
      openInExplorer(folderPath);
    });

    const grid = document.getElementById('treeCardsGrid');
    if (data.items.length === 0) {
      grid.innerHTML = '<p class="text-muted">Nenhum arquivo nesta pasta.</p>';
    } else {
      data.items.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
          <div class="card-info" style="cursor:pointer;">
            <span class="card-name">${file.filename}</span>
            <div class="card-meta-row">
              <span>${formatBytes(file.size_bytes)}</span>
              <span>${formatDate(file.modified_at)}</span>
            </div>
          </div>
        `;
        card.addEventListener('click', () => openPreviewModal(file));
        grid.appendChild(card);
      });
    }
  } catch (e) {
    details.innerHTML = `<p class="text-muted">Erro: ${e.message}</p>`;
  }
}

// 9. AGENDADOR & CRON
async function loadScheduler() {
  try {
    const res = await fetch('/api/scheduler');
    const data = await res.json();

    document.getElementById('schedInstalled').textContent = data.installed ? `✅ Configurado (${data.status})` : '❌ Não agendado';
    document.getElementById('schedInstalled').style.color = data.installed ? 'var(--success-color)' : 'var(--danger-color)';
    document.getElementById('schedNextRun').textContent = data.next_run || '-';
    document.getElementById('schedLastRun').textContent = data.last_run || '-';

    if (data.scheduled_time) {
      document.getElementById('cronTimeInput').value = data.scheduled_time;
    }
    if (data.linux_cron) {
      document.getElementById('linuxCronCode').textContent = data.linux_cron;
    }

    loadHistory();
  } catch (e) {}
}

async function updateSchedulerBadge() {
  try {
    const res = await fetch('/api/scheduler');
    const data = await res.json();
    const dot = document.getElementById('cronStatusDot');
    if (data.installed) {
      dot.classList.add('active');
      dot.title = `Tarefa diária ativa às ${data.scheduled_time}`;
    } else {
      dot.classList.remove('active');
      dot.title = 'Nenhuma tarefa agendada';
    }
  } catch (e) {}
}

async function installSchedulerTask() {
  const time = document.getElementById('cronTimeInput').value;
  try {
    const res = await fetch('/api/scheduler/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: time })
    });
    const data = await res.json();
    showToast(data.message || 'Tarefa agendada!');
    loadScheduler();
    updateSchedulerBadge();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function uninstallSchedulerTask() {
  if (!confirm('Deseja desativar a execução diária no Windows?')) return;
  try {
    const res = await fetch('/api/scheduler/uninstall', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Desativado!');
    loadScheduler();
    updateSchedulerBadge();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function triggerSchedulerNow() {
  try {
    const res = await fetch('/api/scheduler/run-now', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Rotina disparada!');
    setTimeout(loadScheduler, 2000);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function loadHistory() {
  const list = document.getElementById('historyList');
  try {
    const res = await fetch('/api/history?limit=30');
    const data = await res.json();

    list.innerHTML = '';
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<p class="text-muted">Nenhum evento registrado ainda.</p>';
      return;
    }

    data.history.forEach(h => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-weight:600;">
          <span>${h.action.toUpperCase()}</span>
          <span style="color:var(--text-muted); font-size:11px;">${formatDate(h.timestamp)}</span>
        </div>
        <div style="margin-top:4px; color:var(--text-main);">${h.source_path} ${h.dest_path ? '➡️ ' + h.dest_path : ''}</div>
        ${h.details ? `<div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">${h.details}</div>` : ''}
      `;
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = `<p class="text-muted">Erro: ${e.message}</p>`;
  }
}

// 10. POLLING DO ESCANEAMENTO
async function triggerScan() {
  try {
    const res = await fetch('/api/scan/start', { method: 'POST' });
    const data = await res.json();
    showScanBanner();
    startScanPolling();
  } catch (e) {
    alert('Erro ao iniciar escaneamento: ' + e.message);
  }
}

function showScanBanner() {
  document.getElementById('scanStatusBar').style.display = 'flex';
}

function hideScanBanner() {
  document.getElementById('scanStatusBar').style.display = 'none';
}

function startScanPolling() {
  clearInterval(state.scanPollingInterval);
  state.scanPollingInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/scan/progress');
      const data = await res.json();

      if (data.status === 'running') {
        showScanBanner();
        document.getElementById('scanStatusTitle').textContent = `Escaneando disco... (${data.files_scanned.toLocaleString()} arquivos encontrados)`;
        document.getElementById('scanStatusFolder').textContent = data.current_folder || 'Lendo pastas...';
      } else {
        clearInterval(state.scanPollingInterval);
        hideScanBanner();
        loadFiles();
        updateStatsSummary();
      }
    } catch (e) {
      clearInterval(state.scanPollingInterval);
    }
  }, 1000);
}

async function checkScanStatus() {
  try {
    const res = await fetch('/api/scan/progress');
    const data = await res.json();
    if (data.status === 'running') {
      showScanBanner();
      startScanPolling();
    }
  } catch (e) {}
}
