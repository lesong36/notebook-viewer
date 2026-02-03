/**
 * DrawingManager - 涂鸦管理界面
 * 提供按课程维度管理笔记、可视化、练习涂鸦的工具
 */

// 导入服务器API客户端
import { drawingAPI } from '../api/DrawingAPI.js';

const STORAGE_KEY_PREFIX = 'drawing_data_';

const VIEW_TYPE_NAMES = {
  notebook: '📓 笔记',
  html: '🎨 可视化',
  questions: '📝 练习'
};

/**
 * 创建涂鸦管理面板
 * @returns {Promise<HTMLElement>} 管理面板DOM元素
 */
export async function createDrawingManager() {
  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'drawing-manager-overlay';

  // 创建主面板
  const panel = document.createElement('div');
  panel.className = 'drawing-manager-panel';

  // 创建头部
  const header = document.createElement('div');
  header.className = 'manager-header';
  header.innerHTML = `
    <h2>🎨 涂鸦管理</h2>
    <button class="close-button" title="关闭">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  // ⚡ 性能优化：一次性读取并缓存所有数据
  const drawingsCache = await getAllDrawings();
  const groupsCache = groupByCourse(drawingsCache);

  // 创建工具栏
  const toolbar = document.createElement('div');
  toolbar.className = 'manager-toolbar';

  const stats = getDrawingStats(drawingsCache);
  toolbar.innerHTML = `
    <div class="stats">
      <span>共 <strong>${stats.totalCourses}</strong> 个课程</span>
      <span>共 <strong>${stats.totalDrawings}</strong> 个涂鸦</span>
      <span>占用 <strong>${stats.totalSize}</strong></span>
    </div>
    <div class="toolbar-actions">
      <button class="export-all-button">📥 导出所有</button>
      <button class="clear-all-button">🗑️ 清空所有</button>
    </div>
  `;

  // 创建内容区
  const content = document.createElement('div');
  content.className = 'manager-content';
  content.innerHTML = renderDrawingList(drawingsCache, groupsCache);

  // 组装面板
  panel.appendChild(header);
  panel.appendChild(toolbar);
  panel.appendChild(content);
  overlay.appendChild(panel);

  // 绑定事件（传入缓存数据）
  bindManagerEvents(overlay, panel, content, groupsCache);

  return overlay;
}

/**
 * 获取涂鸦统计信息
 */
function getDrawingStats(drawings) {
  const courses = new Set();
  let totalSize = 0;

  drawings.forEach(item => {
    courses.add(item.data.lessonId);
    totalSize += item.size;
  });

  return {
    totalCourses: courses.size,
    totalDrawings: drawings.length,
    totalSize: formatSize(totalSize)
  };
}

/**
 * 获取所有涂鸦数据
 */
async function getAllDrawings() {
  // ⚡ 优先从服务器获取
  try {
    const serverDrawings = await drawingAPI.getAllDrawings();
    if (serverDrawings && serverDrawings.length > 0) {
      console.log(`[DrawingManager] ✅ Loaded ${serverDrawings.length} drawings from server`);
      return serverDrawings;
    }
  } catch (error) {
    console.warn('[DrawingManager] Server unavailable, using localStorage:', error.message);
  }

  // 降级：从 localStorage 读取
  console.log('[DrawingManager] ⚠️ Using localStorage fallback');
  const drawings = [];

  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      try {
        const dataString = localStorage.getItem(key);
        const data = JSON.parse(dataString);
        drawings.push({
          key,
          data,
          size: dataString.length
        });
      } catch (e) {
        console.error('Failed to parse drawing:', key, e);
      }
    }
  });

  // 按lessonId和timestamp排序
  drawings.sort((a, b) => {
    if (a.data.lessonId !== b.data.lessonId) {
      return a.data.lessonId.localeCompare(b.data.lessonId);
    }
    return b.data.timestamp - a.data.timestamp;
  });

  return drawings;
}

/**
 * 按课程分组
 */
function groupByCourse(drawings) {
  const groups = {};

  drawings.forEach(item => {
    const lessonId = item.data.lessonId;
    if (!groups[lessonId]) {
      groups[lessonId] = {};
    }
    groups[lessonId][item.data.viewType] = item;
  });

  return groups;
}

/**
 * 渲染涂鸦列表
 */
function renderDrawingList(drawings, groups) {
  if (drawings.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🎨</div>
        <p>还没有保存的涂鸦</p>
        <p class="empty-hint">在课程中绘制涂鸦后会自动保存到这里</p>
      </div>
    `;
  }

  const lessonIds = Object.keys(groups).sort();

  let html = '<div class="course-list">';

  lessonIds.forEach(lessonId => {
    const courseDrawings = groups[lessonId];
    const viewTypes = Object.keys(courseDrawings);

    // 计算课程总大小
    let courseSize = 0;
    viewTypes.forEach(viewType => {
      courseSize += courseDrawings[viewType].size;
    });

    html += `
      <div class="course-item" data-lesson-id="${lessonId}">
        <div class="course-header">
          <div class="course-info">
            <span class="course-id">${lessonId}</span>
            <span class="course-count">${viewTypes.length} 个涂鸦</span>
            <span class="course-size">${formatSize(courseSize)}</span>
          </div>
          <div class="course-actions">
            <button class="expand-button" title="展开/收起">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <button class="export-course-button" data-lesson-id="${lessonId}" title="导出课程所有涂鸦">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button class="delete-course-button" data-lesson-id="${lessonId}" title="删除课程所有涂鸦">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="course-content" style="display: none;" data-lesson-id="${lessonId}">
          <!-- 延迟加载：展开时才渲染涂鸦列表 -->
        </div>
      </div>
    `;
  });

  html += '</div>';

  return html;
}

/**
 * 渲染单个涂鸦条目
 */
function renderDrawingItem(item) {
  const { data, size, key } = item;
  const viewName = VIEW_TYPE_NAMES[data.viewType] || data.viewType;
  const date = new Date(data.timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <div class="drawing-item" data-key="${key}">
      <div class="drawing-preview">
        <img src="${data.imageData}" alt="${viewName}" loading="lazy" />
      </div>
      <div class="drawing-info">
        <div class="drawing-name">${viewName}</div>
        <div class="drawing-meta">
          <span>${formatSize(size)}</span>
          <span>${date}</span>
        </div>
      </div>
      <div class="drawing-actions">
        <button class="preview-button" data-key="${key}" title="预览">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button class="export-button" data-key="${key}" title="导出">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        <button class="delete-button" data-key="${key}" title="删除">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * 绑定事件
 */
function bindManagerEvents(overlay, panel, content, groupsCache) {
  // 关闭按钮
  overlay.querySelector('.close-button').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // 导出所有
  overlay.querySelector('.export-all-button').addEventListener('click', () => {
    exportAllDrawings();
  });

  // 清空所有
  overlay.querySelector('.clear-all-button').addEventListener('click', () => {
    if (confirm('确定要删除所有涂鸦吗？此操作不可恢复！')) {
      (async () => {
        await clearAllDrawings();
        // 重新读取数据并渲染
        const newDrawings = await getAllDrawings();
        const newGroups = groupByCourse(newDrawings);
        content.innerHTML = renderDrawingList(newDrawings, newGroups);
        updateStats(overlay, newDrawings);
      })();
    }
  });

  // 事件委托：课程展开/收起
  content.addEventListener('click', (e) => {
    const expandBtn = e.target.closest('.expand-button');
    if (expandBtn) {
      const courseItem = expandBtn.closest('.course-item');
      const courseContent = courseItem.querySelector('.course-content');
      const isExpanded = courseContent.style.display !== 'none';

      if (isExpanded) {
        // 收起
        courseContent.style.display = 'none';
        expandBtn.classList.remove('expanded');
      } else {
        // 展开：延迟加载涂鸦列表
        const lessonId = courseContent.dataset.lessonId;

        // 检查是否已经渲染过
        if (courseContent.children.length === 0 ||
            courseContent.innerHTML.includes('延迟加载')) {
          // 显示加载提示
          courseContent.innerHTML = '<div style="padding: 1rem; text-align: center; color: #6c757d;">加载中...</div>';
          courseContent.style.display = 'block';

          // 使用 setTimeout 让浏览器先渲染加载提示
          setTimeout(() => {
            // 使用缓存的数据，避免重新读取 localStorage
            const courseDrawings = groupsCache[lessonId];

            if (courseDrawings) {
              let html = '';
              ['notebook', 'html', 'questions'].forEach(viewType => {
                if (courseDrawings[viewType]) {
                  html += renderDrawingItem(courseDrawings[viewType]);
                }
              });
              courseContent.innerHTML = html;
            } else {
              courseContent.innerHTML = '<div style="padding: 1rem; text-align: center; color: #adb5bd;">暂无涂鸦</div>';
            }
          }, 10);
        } else {
          courseContent.style.display = 'block';
        }

        expandBtn.classList.add('expanded');
      }
    }

    // 导出课程
    const exportCourseBtn = e.target.closest('.export-course-button');
    if (exportCourseBtn) {
      const lessonId = exportCourseBtn.dataset.lessonId;
      exportCourse(lessonId);
    }

    // 删除课程
    const deleteCourseBtn = e.target.closest('.delete-course-button');
    if (deleteCourseBtn) {
      const lessonId = deleteCourseBtn.dataset.lessonId;
      if (confirm(`确定要删除课程 ${lessonId} 的所有涂鸦吗？`)) {
        (async () => {
          await deleteCourse(lessonId);
          // 重新读取数据并渲染
          const newDrawings = await getAllDrawings();
          const newGroups = groupByCourse(newDrawings);
          content.innerHTML = renderDrawingList(newDrawings, newGroups);
          updateStats(overlay, newDrawings);
        })();
      }
    }

    // 预览涂鸦
    const previewBtn = e.target.closest('.preview-button');
    if (previewBtn) {
      const key = previewBtn.dataset.key;
      previewDrawing(key);
    }

    // 导出单个涂鸦
    const exportBtn = e.target.closest('.export-button');
    if (exportBtn) {
      const key = exportBtn.dataset.key;
      exportDrawing(key);
    }

    // 删除单个涂鸦
    const deleteBtn = e.target.closest('.delete-button');
    if (deleteBtn) {
      const key = deleteBtn.dataset.key;
      const data = JSON.parse(localStorage.getItem(key));
      const viewName = VIEW_TYPE_NAMES[data.viewType];

      if (confirm(`确定要删除 ${data.lessonId} 的${viewName}涂鸦吗？`)) {
        (async () => {
          // 1. 尝试从服务器删除
          try {
            await drawingAPI.deleteDrawing(data.lessonId, data.viewType);
            console.log(`[DELETE] ✅ Deleted ${data.lessonId}/${data.viewType} from server`);
          } catch (error) {
            console.warn('[DELETE] Failed to delete from server:', error.message);
          }

          // 2. 从 localStorage 删除
          localStorage.removeItem(key);

          // 3. 重新读取数据并渲染
          const newDrawings = await getAllDrawings();
          const newGroups = groupByCourse(newDrawings);
          content.innerHTML = renderDrawingList(newDrawings, newGroups);
          updateStats(overlay, newDrawings);
        })();
      }
    }
  });
}

/**
 * 更新统计信息
 */
function updateStats(overlay, drawings) {
  const stats = getDrawingStats(drawings);
  const statsEl = overlay.querySelector('.stats');
  statsEl.innerHTML = `
    <span>共 <strong>${stats.totalCourses}</strong> 个课程</span>
    <span>共 <strong>${stats.totalDrawings}</strong> 个涂鸦</span>
    <span>占用 <strong>${stats.totalSize}</strong></span>
  `;
}

/**
 * 导出所有涂鸦（分别下载PNG图片）
 */
function exportAllDrawings() {
  const drawings = getAllDrawings();

  if (drawings.length === 0) {
    alert('没有可导出的涂鸦');
    return;
  }

  if (!confirm(`将导出 ${drawings.length} 个涂鸦图片，是否继续？`)) {
    return;
  }

  // 延时下载，避免浏览器阻止
  let delay = 0;
  drawings.forEach((item, index) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = item.data.imageData;
      a.download = `${item.data.lessonId}_${item.data.viewType}_${formatDateForFilename(new Date(item.data.timestamp))}.png`;
      a.click();
    }, delay);
    delay += 200; // 每个文件间隔200ms
  });

  console.log(`[EXPORT] Exported ${drawings.length} drawings`);
}

/**
 * 导出课程所有涂鸦（分别下载PNG图片）
 */
function exportCourse(lessonId) {
  const drawings = getAllDrawings().filter(item => item.data.lessonId === lessonId);

  if (drawings.length === 0) {
    alert('该课程没有涂鸦');
    return;
  }

  if (!confirm(`将导出课程 ${lessonId} 的 ${drawings.length} 个涂鸦图片，是否继续？`)) {
    return;
  }

  // 延时下载，避免浏览器阻止
  let delay = 0;
  drawings.forEach((item, index) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = item.data.imageData;
      a.download = `${item.data.lessonId}_${item.data.viewType}_${formatDateForFilename(new Date(item.data.timestamp))}.png`;
      a.click();
    }, delay);
    delay += 200;
  });

  console.log(`[EXPORT] Exported ${drawings.length} drawings from ${lessonId}`);
}

/**
 * 导出单个涂鸦（PNG图片）
 */
function exportDrawing(key) {
  const data = JSON.parse(localStorage.getItem(key));

  // 直接使用 imageData（已经是 DataURL 格式）下载为PNG
  const a = document.createElement('a');
  a.href = data.imageData;
  a.download = `${data.lessonId}_${data.viewType}_${formatDateForFilename(new Date(data.timestamp))}.png`;
  a.click();

  console.log(`[EXPORT] Exported ${data.lessonId} - ${data.viewType} as PNG`);
}

/**
 * 删除课程所有涂鸦
 */
async function deleteCourse(lessonId) {
  // 1. 尝试从服务器删除
  try {
    await drawingAPI.deleteCourse(lessonId);
    console.log(`[DELETE] ✅ Deleted course ${lessonId} from server`);
  } catch (error) {
    console.warn('[DELETE] Failed to delete from server:', error.message);
  }

  // 2. 从 localStorage 删除（无论服务器是否成功）
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(STORAGE_KEY_PREFIX) && key.includes(lessonId)) {
      localStorage.removeItem(key);
    }
  });

  console.log(`[DELETE] Deleted course ${lessonId} from localStorage`);
}

/**
 * 清空所有涂鸦
 */
async function clearAllDrawings() {
  // 1. 尝试从服务器删除所有数据
  try {
    await drawingAPI.deleteAll();
    console.log('[DELETE] ✅ Deleted all drawings from server');
  } catch (error) {
    console.warn('[DELETE] Failed to delete from server:', error.message);
  }

  // 2. 从 localStorage 删除（无论服务器是否成功）
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });

  console.log('[DELETE] ✅ Cleared all drawings from localStorage');
}

/**
 * 预览涂鸦
 */
function previewDrawing(key) {
  const data = JSON.parse(localStorage.getItem(key));
  const viewName = VIEW_TYPE_NAMES[data.viewType];

  // 创建预览窗口
  const previewOverlay = document.createElement('div');
  previewOverlay.className = 'drawing-preview-overlay';
  previewOverlay.innerHTML = `
    <div class="preview-dialog">
      <div class="preview-header">
        <h3>${data.lessonId} - ${viewName}</h3>
        <button class="close-preview-button">✕</button>
      </div>
      <div class="preview-body">
        <img src="${data.imageData}" alt="${viewName}" />
      </div>
      <div class="preview-footer">
        <span>${formatSize(localStorage.getItem(key).length)}</span>
        <span>${new Date(data.timestamp).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  `;

  document.body.appendChild(previewOverlay);

  previewOverlay.querySelector('.close-preview-button').addEventListener('click', () => {
    document.body.removeChild(previewOverlay);
  });

  previewOverlay.addEventListener('click', (e) => {
    if (e.target === previewOverlay) {
      document.body.removeChild(previewOverlay);
    }
  });
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * 格式化日期为文件名
 */
function formatDateForFilename(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}`;
}
