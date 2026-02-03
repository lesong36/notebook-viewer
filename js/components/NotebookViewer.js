/**
 * NotebookViewer组件
 * 负责加载和渲染Jupyter Notebook内容
 */

import { parseNotebook, findLessonSection, renderCells } from '../utils/notebookParser.js';

/**
 * 创建Notebook查看器
 * @param {string} lessonId - 课程ID (如 'L2-01')
 * @param {HTMLElement} container - 容器DOM元素
 * @returns {Promise<void>}
 */
export async function createNotebookViewer(lessonId, container) {
  // 清空容器
  container.innerHTML = '';

  // 清理可能残留的目录悬浮层（避免切换课程后叠加）
  const existingTocOverlay = document.getElementById('notebook-toc-overlay');
  if (existingTocOverlay) existingTocOverlay.remove();
  removeNotebookDock(container);

  // 创建加载提示
  const loadingEl = document.createElement('div');
  loadingEl.className = 'notebook-loading';
  loadingEl.innerHTML = '<div class="loading-spinner"></div><p>加载教学笔记中...</p>';
  container.appendChild(loadingEl);

  try {
    // 根据lessonId确定notebook文件
    // L2-01 → L2.ipynb (旧格式L系列)
    // L3-15 → L3.ipynb
    // P-0 → P.ipynb
    // P-1 → P.ipynb
    // S1-01 → S.ipynb (旧格式S系列)
    // S2-03 → S.ipynb
    // G1-01 → G.ipynb (旧格式G系列)
    // G3-04 → G.ipynb
    // A1-01 → L1N.ipynb (新格式数与代数系列)
    // U3-05 → L3N.ipynb (新格式综合实践系列)
    // Z4-02 → L4N.ipynb (新格式数学思维系列)
    // Q5-01 → L5N.ipynb (新格式应用题系列)
    let notebookFile;

    // 提取课程ID中的年级号
    const gradeMatch = lessonId.match(/[A-Z]+(\d+)-/);

    if (lessonId.startsWith('P-')) {
      // P系列：预备课
      notebookFile = 'P';
    } else if (gradeMatch) {
      // 新格式：A, U, G, Z, Q, S + 年级 (如 A1-01, U3-05, Z4-02)
      const grade = gradeMatch[1];
      const prefix = lessonId.match(/^([A-Z]+)/)[1];

      // A, U, Z, Q 系列使用 LXN.ipynb 格式
      if (['A', 'U', 'Z', 'Q'].includes(prefix)) {
        // 特殊情况：A3-21实际在L2N.ipynb中
        if (lessonId === 'A3-21') {
          notebookFile = 'L2N';
        } else {
          notebookFile = `L${grade}N`;
        }
      }
      // S 系列：所有S系列课程都在LXN.ipynb中
      else if (prefix === 'S') {
        notebookFile = `L${grade}N`;
      }
      // G 系列优先检查新格式 LXN.ipynb，回退到旧格式 G.ipynb
      else if (prefix === 'G') {
        notebookFile = `L${grade}N`;
      }
      // L 系列（旧格式）
      else if (prefix === 'L') {
        notebookFile = `L${grade}`;
      } else {
        throw new Error(`Unknown lesson prefix: ${prefix}`);
      }
    } else {
      throw new Error(`Unknown lesson ID format: ${lessonId}`);
    }

    // 加载并解析notebook
    const cells = await parseNotebook(notebookFile);

    // 定位到对应课程章节
    const { start, end } = findLessonSection(cells, lessonId);
    const sectionCells = cells.slice(start, end);

    // 移除加载提示
    container.innerHTML = '';

    // 创建notebook容器
    const notebookEl = document.createElement('div');
    notebookEl.className = 'notebook-container';

    // 创建标题
    const headerEl = document.createElement('div');
    headerEl.className = 'notebook-header';
    headerEl.innerHTML = `
      <div class="notebook-icon">📓</div>
      <h2 class="notebook-title">${lessonId} 教学笔记</h2>
      <div class="notebook-meta">共 ${sectionCells.length} 个单元格</div>
    `;
    notebookEl.appendChild(headerEl);

    // 创建内容区域
    const contentEl = document.createElement('div');
    contentEl.className = 'notebook-content';
    notebookEl.appendChild(contentEl);

    // 渲染每个cell
    sectionCells.forEach((cell, index) => {
      const cellEl = document.createElement('div');
      cellEl.className = `notebook-cell cell-${cell.cell_type}`;
      cellEl.dataset.cellIndex = index;

      // 渲染cell内容
      cellEl.innerHTML = renderCell(cell);

      contentEl.appendChild(cellEl);
    });

    container.appendChild(notebookEl);

    // 生成并绑定“本节目录”
    try {
      const toc = buildNotebookToc(contentEl, lessonId);
      if (toc.items.length > 0) {
        const dock = createNotebookDock(container);
        dock.button.style.display = 'inline-flex';
        dock.button.onclick = () => openNotebookTocOverlay(
          { lessonId, items: toc.items },
          dock.button
        );
        dock.updatePosition();
      }
    } catch (e) {
      console.warn('[NotebookTOC] Failed to build TOC:', e);
    }

    // 处理图片加载错误
    const images = container.querySelectorAll('.markdown-content img');
    images.forEach(img => {
      img.addEventListener('error', function() {
        // 创建占位符
        const placeholder = document.createElement('div');
        placeholder.className = 'image-placeholder';
        placeholder.style.cssText = `
          background: #f1f5f9;
          border: 2px dashed #cbd5e0;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          color: #64748b;
          margin: 1rem 0;
        `;
        placeholder.innerHTML = `
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🖼️</div>
          <div style="font-size: 0.875rem;">图片加载失败</div>
          <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">
            ${this.alt || this.src.split('/').pop()}
          </div>
        `;
        // 替换图片
        this.parentNode.replaceChild(placeholder, this);
      });
    });

    // 渲染Mermaid图表
    const mermaidDiagrams = container.querySelectorAll('.mermaid-diagram');
    if (mermaidDiagrams.length > 0 && typeof window.mermaid !== 'undefined') {
      // 等待 mermaid 加载完成后渲染
      setTimeout(async () => {
        try {
          await window.mermaid.run({
            nodes: mermaidDiagrams
          });
          console.log(`[Mermaid] Rendered ${mermaidDiagrams.length} diagrams`);
        } catch (error) {
          console.error('[Mermaid] Rendering error:', error);
          // 渲染失败时显示错误信息
          mermaidDiagrams.forEach(diagram => {
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = `
              background: #fef2f2;
              border: 2px dashed #fca5a5;
              border-radius: 8px;
              padding: 1rem;
              color: #dc2626;
              margin: 1rem 0;
            `;
            errorMsg.innerHTML = `
              <div style="font-weight: 600; margin-bottom: 0.5rem;">📊 Mermaid 图表渲染失败</div>
              <pre style="font-size: 0.75rem; overflow-x: auto;">${diagram.textContent}</pre>
            `;
            diagram.replaceWith(errorMsg);
          });
        }
      }, 300);
    }

    // 渲染数学公式 (使用KaTeX)
    if (typeof renderMathInElement !== 'undefined') {
      try {
        renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false,
          strict: false
        });
      } catch (e) {
        console.warn('KaTeX rendering error:', e);
      }
    }

  } catch (error) {
    // 错误处理
    container.innerHTML = '';
    const errorEl = document.createElement('div');
    errorEl.className = 'notebook-error';
    errorEl.innerHTML = `
      <div class="error-icon">❌</div>
      <h3>加载失败</h3>
      <p>${error.message}</p>
      <button onclick="location.reload()" class="retry-button">重试</button>
    `;
    container.appendChild(errorEl);
    console.error('Failed to load notebook:', error);
  }
}

function removeNotebookDock(container) {
  if (!container) return;
  try {
    const cleanup = container.__notebookDockCleanup;
    if (typeof cleanup === 'function') cleanup();
  } catch {}
  try { container.classList.remove('has-notebook-dock'); } catch {}
  const dockId = container.dataset?.notebookDockId;
  if (dockId) {
    const el = document.getElementById(dockId);
    if (el) el.remove();
  }
  if (container.dataset) delete container.dataset.notebookDockId;
  delete container.__notebookDockCleanup;
}

/**
 * 创建固定在“笔记面板最左边”的工具条（避免 sticky 在部分浏览器/滚动容器里失效）
 * @param {HTMLElement} paneEl - 当前渲染Notebook的面板容器（split-pane）
 * @returns {{el: HTMLElement, button: HTMLButtonElement, updatePosition: Function}}
 */
function createNotebookDock(paneEl) {
  removeNotebookDock(paneEl);

  const dockId = `notebook-dock-${Math.random().toString(36).slice(2, 10)}`;
  paneEl.dataset.notebookDockId = dockId;
  paneEl.classList.add('has-notebook-dock');

  const el = document.createElement('div');
  el.id = dockId;
  el.className = 'notebook-dock-actions';
  el.style.display = 'none';

  el.innerHTML = `
    <button class="notebook-toc-button" type="button" style="display:none" aria-label="本节目录" title="本节目录" aria-haspopup="dialog" aria-expanded="false">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 6h13M8 12h13M8 18h13"/>
        <path d="M3 6h.01M3 12h.01M3 18h.01"/>
      </svg>
    </button>
  `;

  document.body.appendChild(el);

  const button = el.querySelector('.notebook-toc-button');

  const updatePosition = () => {
    if (!document.body.contains(el)) return;
    if (!paneEl.isConnected) return;

    // 若面板里已不是Notebook视图，则自动清理
    if (!paneEl.querySelector('.notebook-container')) {
      removeNotebookDock(paneEl);
      return;
    }

    const rect = paneEl.getBoundingClientRect();
    const left = Math.round(rect.left + 8);
    const top = Math.round(rect.top + 12);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.maxHeight = `${Math.max(120, rect.height - 24)}px`;
    el.style.display = 'flex';
  };

  const onResize = () => updatePosition();
  window.addEventListener('resize', onResize, { passive: true });

  const resizeObserver = new ResizeObserver(() => updatePosition());
  try {
    resizeObserver.observe(paneEl);
  } catch {}

  const mutationObserver = new MutationObserver(() => updatePosition());
  try {
    mutationObserver.observe(paneEl, { childList: true, subtree: true });
  } catch {}

  paneEl.__notebookDockCleanup = () => {
    window.removeEventListener('resize', onResize);
    try { resizeObserver.disconnect(); } catch {}
    try { mutationObserver.disconnect(); } catch {}
    try { paneEl.classList.remove('has-notebook-dock'); } catch {}
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };

  return { el, button, updatePosition };
}

/**
 * 生成本节目录（扫描渲染后的 heading 元素，并为其补充 id）
 * @param {HTMLElement} contentEl - notebook-content 容器
 * @param {string} lessonId
 * @returns {{items: Array<{id: string, text: string, level: number}>}}
 */
function buildNotebookToc(contentEl, lessonId) {
  const headingSelector = '.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6';
  const headings = Array.from(contentEl.querySelectorAll(headingSelector));
  if (headings.length === 0) return { items: [] };

  const normalizeText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
  const slugify = (text) => {
    const t = normalizeText(text).toLowerCase();
    const slug = t
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || 'section';
  };

  // 若第一条 heading 明显是本节标题（含 lessonId），则目录只展示子目录；否则保留全部 heading
  const firstHeadingText = normalizeText(headings[0]?.textContent);
  const shouldSkipFirst = firstHeadingText && lessonId && firstHeadingText.includes(lessonId);
  const candidates = (shouldSkipFirst ? headings.slice(1) : headings).filter(h => normalizeText(h.textContent));
  if (candidates.length === 0) return { items: [] };

  const levels = candidates
    .map(h => parseInt(h.tagName.slice(1), 10))
    .filter(n => Number.isFinite(n));
  const minLevel = levels.length ? Math.min(...levels) : 2;

  const usedIds = new Set();
  const items = [];
  candidates.forEach((h, index) => {
    const text = normalizeText(h.textContent);
    const rawLevel = parseInt(h.tagName.slice(1), 10);
    const level = Number.isFinite(rawLevel) ? Math.max(1, rawLevel - minLevel + 1) : 1;

    let id = h.getAttribute('id');
    if (!id) {
      id = `nb-${lessonId}-${slugify(text)}-${index + 1}`;
    }
    id = id.replace(/\s+/g, '-');
    while (usedIds.has(id) || document.getElementById(id)) {
      id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
    }
    usedIds.add(id);
    h.setAttribute('id', id);

    items.push({ id, text, level });
  });

  return { items };
}

/**
 * 打开目录悬浮层
 * @param {{lessonId: string, items: Array<{id: string, text: string, level: number}>}} toc
 * @param {HTMLButtonElement} sourceButton
 */
function openNotebookTocOverlay(toc, sourceButton) {
  const existing = document.getElementById('notebook-toc-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'notebook-toc-overlay';
  overlay.className = 'notebook-toc-overlay';

  const panel = document.createElement('div');
  panel.className = 'notebook-toc-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  panel.innerHTML = `
    <div class="notebook-toc-header">
      <div class="notebook-toc-title">本节目录</div>
      <button class="notebook-toc-close" type="button" aria-label="关闭目录">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="notebook-toc-list" role="list"></div>
  `;

  const list = panel.querySelector('.notebook-toc-list');
  toc.items.forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'notebook-toc-item';
    row.style.paddingLeft = `${12 + (item.level - 1) * 16}px`;
    row.textContent = item.text;
    row.onclick = () => {
      const target = document.getElementById(item.id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('notebook-toc-target-flash');
        setTimeout(() => target.classList.remove('notebook-toc-target-flash'), 800);
      }
      close();
    };
    list.appendChild(row);
  });

  const closeBtn = panel.querySelector('.notebook-toc-close');
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    if (sourceButton) sourceButton.setAttribute('aria-expanded', 'false');
  };
  closeBtn.onclick = close;

  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  if (sourceButton) sourceButton.setAttribute('aria-expanded', 'true');
}

/**
 * 渲染单个cell (内部使用)
 * @param {Object} cell - notebook cell对象
 * @returns {string} - HTML字符串
 */
function renderCell(cell) {
  if (!cell || !cell.source) {
    return '<div class="empty-cell">空单元格</div>';
  }

  const content = Array.isArray(cell.source)
    ? cell.source.join('')
    : cell.source;

  if (cell.cell_type === 'markdown') {
    // Markdown渲染
    if (typeof marked !== 'undefined') {
      try {
        // 保护LaTeX公式和Mermaid图表：先提取，marked解析后再恢复
        const mathMap = new Map();  // 使用 Map 存储占位符和对应的 LaTeX
        const mermaidMap = new Map();  // 存储 mermaid 代码块
        let placeholderCounter = 0;
        let mermaidCounter = 0;
        let protectedContent = content;

        // 保护```mermaid...```代码块
        protectedContent = protectedContent.replace(/```mermaid\n([\s\S]+?)```/g, (match, code) => {
          const placeholder = `MERMAIDPLACEHOLDER${mermaidCounter}END`;
          mermaidMap.set(placeholder, code.trim());
          mermaidCounter++;
          return placeholder;
        });

        // 保护$$...$$块级公式
        protectedContent = protectedContent.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
          const placeholder = `MATHPLACEHOLDER${placeholderCounter}END`;
          mathMap.set(placeholder, match);
          placeholderCounter++;
          return placeholder;
        });

        // 保护$...$行内公式
        protectedContent = protectedContent.replace(/\$([^\$\n]+?)\$/g, (match) => {
          const placeholder = `MATHPLACEHOLDER${placeholderCounter}END`;
          mathMap.set(placeholder, match);
          placeholderCounter++;
          return placeholder;
        });

        // 保护\[...\]和\(...\)
        protectedContent = protectedContent.replace(/\\\[([\s\S]+?)\\\]/g, (match) => {
          const placeholder = `MATHPLACEHOLDER${placeholderCounter}END`;
          mathMap.set(placeholder, match);
          placeholderCounter++;
          return placeholder;
        });

        protectedContent = protectedContent.replace(/\\\(([\s\S]+?)\\\)/g, (match) => {
          const placeholder = `MATHPLACEHOLDER${placeholderCounter}END`;
          mathMap.set(placeholder, match);
          placeholderCounter++;
          return placeholder;
        });

        // 配置marked选项，启用GFM（GitHub Flavored Markdown）
        marked.setOptions({
          gfm: true,           // 启用 GitHub Flavored Markdown
          breaks: false,       // 不自动转换换行为<br>
          tables: true,        // 启用表格支持
          pedantic: false,     // 不使用严格模式
          sanitize: false,     // 不过滤HTML（我们信任notebook内容）
          smartLists: true,    // 智能列表
          smartypants: false   // 不转换引号
        });

        // 用marked解析Markdown
        let html = marked.parse(protectedContent);

        // 恢复LaTeX公式
        mathMap.forEach((latex, placeholder) => {
          while (html.includes(placeholder)) {
            html = html.replace(placeholder, latex);
          }
        });

        // 恢复Mermaid图表（转换为可渲染的div）
        mermaidMap.forEach((code, placeholder) => {
          const mermaidId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const mermaidHtml = `<div class="mermaid-diagram" id="${mermaidId}">${escapeHtml(code)}</div>`;
          while (html.includes(placeholder)) {
            html = html.replace(placeholder, mermaidHtml);
          }
        });

        return `<div class="markdown-content">${html}</div>`;
      } catch (e) {
        console.error('Markdown parsing error:', e);
        return `<div class="markdown-fallback"><pre>${content}</pre></div>`;
      }
    } else {
      // marked库未加载,使用降级方案
      return `<div class="markdown-fallback"><pre>${content}</pre></div>`;
    }
  } else if (cell.cell_type === 'code') {
    // 代码块渲染（默认折叠，显示输出结果）
    const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;

    // 处理outputs（Jupyter Notebook已执行的输出）
    let outputsHtml = '';
    if (cell.outputs && cell.outputs.length > 0) {
      outputsHtml = '<div class="code-output output-display">';
      cell.outputs.forEach(output => {
        if (output.output_type === 'stream') {
          // 标准输出
          const text = Array.isArray(output.text) ? output.text.join('') : output.text;
          outputsHtml += `<div class="output-text"><pre>${escapeHtml(text)}</pre></div>`;
        } else if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
          // 执行结果或显示数据
          if (output.data) {
            // 文本输出
            if (output.data['text/plain']) {
              const text = Array.isArray(output.data['text/plain'])
                ? output.data['text/plain'].join('')
                : output.data['text/plain'];
              outputsHtml += `<div class="output-text"><pre>${escapeHtml(text)}</pre></div>`;
            }
            // 图片输出（PNG/JPG）
            if (output.data['image/png']) {
              outputsHtml += `<div class="output-plot"><img src="data:image/png;base64,${output.data['image/png']}" alt="输出图表" style="max-width: 100%; height: auto;"></div>`;
            } else if (output.data['image/jpeg']) {
              outputsHtml += `<div class="output-plot"><img src="data:image/jpeg;base64,${output.data['image/jpeg']}" alt="输出图表" style="max-width: 100%; height: auto;"></div>`;
            }
            // HTML输出
            if (output.data['text/html']) {
              const html = Array.isArray(output.data['text/html'])
                ? output.data['text/html'].join('')
                : output.data['text/html'];
              outputsHtml += `<div class="output-html">${html}</div>`;
            }
          }
        } else if (output.output_type === 'error') {
          // 错误输出
          const errorText = output.traceback ? output.traceback.join('\n') :
                          (output.evalue || '未知错误');
          outputsHtml += `<div class="output-error"><div class="error-title">执行错误:</div><pre>${escapeHtml(errorText)}</pre></div>`;
        }
      });
      outputsHtml += '</div>';
    }

    return `
      <div class="code-wrapper collapsed" data-code-id="${codeId}">
        <div class="code-header">
          <button class="toggle-code-btn" onclick="window.toggleCodeVisibility('${codeId}')">
            <svg class="icon-collapsed" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 5l7 7-7 7"/>
            </svg>
            <svg class="icon-expanded" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
              <path d="M5 9l7 7 7-7"/>
            </svg>
            <span class="toggle-text">显示代码</span>
          </button>
          <div class="code-label">Python</div>
          <button class="run-code-btn" onclick="window.runPythonCode('${codeId}')" title="在浏览器中执行Python代码">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            运行
          </button>
        </div>
        <pre class="code-block" style="display: none;"><code data-code="${codeId}">${escapeHtml(content)}</code></pre>
        ${outputsHtml}
        <div class="code-output-dynamic" id="output-${codeId}" style="display: none;"></div>
      </div>
    `;
  } else {
    // 其他类型
    return `<div class="raw-cell"><pre>${escapeHtml(content)}</pre></div>`;
  }
}

/**
 * HTML转义
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 让通过 innerHTML 插入的 <script> 执行（浏览器默认不会执行）
 * @param {HTMLElement} container
 */
function executeInlineScripts(container) {
  if (!container) return;
  const scripts = Array.from(container.querySelectorAll('script'));
  scripts.forEach(oldScript => {
    const newScript = document.createElement('script');
    // 复制属性（如 type/module, src 等）
    Array.from(oldScript.attributes || []).forEach(attr => {
      newScript.setAttribute(attr.name, attr.value);
    });
    newScript.text = oldScript.textContent || '';
    oldScript.parentNode?.replaceChild(newScript, oldScript);
  });
}

/**
 * 切换代码可见性
 * @param {string} codeId - 代码块ID
 */
window.toggleCodeVisibility = function(codeId) {
  const wrapper = document.querySelector(`[data-code-id="${codeId}"]`);
  const codeBlock = wrapper.querySelector('.code-block');
  const toggleBtn = wrapper.querySelector('.toggle-code-btn');
  const iconCollapsed = toggleBtn.querySelector('.icon-collapsed');
  const iconExpanded = toggleBtn.querySelector('.icon-expanded');
  const toggleText = toggleBtn.querySelector('.toggle-text');

  if (wrapper.classList.contains('collapsed')) {
    // 展开代码
    wrapper.classList.remove('collapsed');
    wrapper.classList.add('expanded');
    codeBlock.style.display = 'block';
    iconCollapsed.style.display = 'none';
    iconExpanded.style.display = 'inline';
    toggleText.textContent = '隐藏代码';
  } else {
    // 折叠代码
    wrapper.classList.add('collapsed');
    wrapper.classList.remove('expanded');
    codeBlock.style.display = 'none';
    iconCollapsed.style.display = 'inline';
    iconExpanded.style.display = 'none';
    toggleText.textContent = '显示代码';
  }
};

/**
 * 执行Python代码
 * @param {string} codeId - 代码块ID
 */
window.runPythonCode = async function(codeId) {
  const codeElement = document.querySelector(`code[data-code="${codeId}"]`);
  const outputElement = document.getElementById(`output-${codeId}`);
  const buttonElement = document.querySelector(`[data-code-id="${codeId}"] .run-code-btn`);

  if (!codeElement || !outputElement) return;

  // 获取代码内容（需要反转义HTML实体）
  const code = codeElement.textContent;

  // 显示加载状态
  buttonElement.disabled = true;
  buttonElement.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="spinning">
      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
    </svg>
    执行中...
  `;
  outputElement.style.display = 'block';
  outputElement.innerHTML = '<div class="output-loading">正在初始化Python环境...</div>';

  try {
    // 动态导入PythonExecutor
    if (!window.pythonExecutor) {
      const module = await import('../utils/PythonExecutor.js');
      window.pythonExecutor = module.default;
    }

    // 执行代码
    const result = await window.pythonExecutor.execute(code);

    // 显示结果
    if (result.success) {
      let html = '';

      // 显示文本输出
      if (result.output) {
        html += `<div class="output-text"><pre>${escapeHtml(result.output)}</pre></div>`;
      }

      // 显示 HTML 输出（例如 display(HTML(...))）
      if (result.htmlOutputs && result.htmlOutputs.length > 0) {
        result.htmlOutputs.forEach((snippet) => {
          html += `<div class="output-html">${snippet}</div>`;
        });
      }

      // 显示图表
      if (result.plots && result.plots.length > 0) {
        result.plots.forEach((plot, index) => {
          html += `<div class="output-plot">
            <img src="${plot}" alt="图表 ${index + 1}" style="max-width: 100%; height: auto;">
          </div>`;
        });
      }

      outputElement.innerHTML = html || '<div class="output-text"><pre>(执行成功，无输出)</pre></div>';
      outputElement.className = 'code-output-dynamic output-success';

      // 让 HTML 输出中的脚本可运行
      if (result.htmlOutputs && result.htmlOutputs.length > 0) {
        executeInlineScripts(outputElement);
      }
    } else {
      // 显示错误
      outputElement.innerHTML = `
        <div class="output-error">
          <div class="error-title">执行错误:</div>
          <pre>${escapeHtml(result.error)}</pre>
        </div>
      `;
      outputElement.className = 'code-output-dynamic output-error';
    }
  } catch (error) {
    outputElement.innerHTML = `
      <div class="output-error">
        <div class="error-title">系统错误:</div>
        <pre>${escapeHtml(error.message)}</pre>
      </div>
    `;
    outputElement.className = 'code-output-dynamic output-error';
  } finally {
    // 恢复按钮状态
    buttonElement.disabled = false;
    buttonElement.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
      运行
    `;
  }
};
