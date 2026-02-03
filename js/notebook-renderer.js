/**
 * notebook-renderer.js - Notebook 渲染器
 */

import { state } from './config.js';
import { escapeHtml, showToast, showLoading, hideLoading } from './utils.js';
import { resizeCanvas, loadDrawingData, startDrawing, draw, stopDrawing } from './drawing.js';
import { buildOutline } from './outline.js';

// 渲染 Notebook
export async function renderNotebook(notebook) {
    const cells = notebook.cells || [];
    const contentWrapper = document.getElementById('content-wrapper');

    contentWrapper.innerHTML = `
        <canvas id="drawing-canvas" class="drawing-canvas"></canvas>
        <div class="notebook-container">
            <div class="notebook-header">
                <div class="notebook-title">${escapeHtml(state.currentFileName)}</div>
                <div class="notebook-meta">共 ${cells.length} 个单元格</div>
            </div>
            <div class="notebook-content" id="notebook-content"></div>
        </div>`;

    // 更新 canvas 引用
    const newCanvas = document.getElementById('drawing-canvas');
    if (newCanvas) {
        state.canvas = newCanvas;
        state.ctx = newCanvas.getContext('2d');

        // 重新绑定鼠标事件
        newCanvas.addEventListener('mousedown', startDrawing);
        newCanvas.addEventListener('mousemove', draw);
        newCanvas.addEventListener('mouseup', stopDrawing);
        newCanvas.addEventListener('mouseout', stopDrawing);
    }

    const contentEl = document.getElementById('notebook-content');
    cells.forEach((cell, index) => {
        const cellEl = document.createElement('div');
        cellEl.className = `notebook-cell cell-${cell.cell_type}`;
        cellEl.innerHTML = renderCell(cell, index);
        contentEl.appendChild(cellEl);
    });

    // 渲染数学公式
    if (typeof renderMathInElement !== 'undefined') {
        setTimeout(() => {
            renderMathInElement(contentEl, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        }, 100);
    }

    // 渲染 Mermaid
    const mermaidDiagrams = contentEl.querySelectorAll('.mermaid-diagram');
    if (mermaidDiagrams.length > 0 && window.mermaid) {
        setTimeout(async () => {
            try { await window.mermaid.run({ nodes: mermaidDiagrams }); } catch (e) { console.error('Mermaid error:', e); }
        }, 300);
    }

    buildOutline(contentEl);
    resizeCanvas();

    // 执行 HTML 输出中的脚本
    setTimeout(() => executeHtmlScripts(contentEl), 500);
}

// 执行 HTML 脚本
function executeHtmlScripts(container) {
    const scriptContainers = container.querySelectorAll('.output-html-with-script[data-script-pending="true"]');
    scriptContainers.forEach(div => {
        div.removeAttribute('data-script-pending');
        const scripts = div.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });
            newScript.textContent = oldScript.textContent;
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    });
}

// 渲染单元格
export function renderCell(cell, index) {
    if (!cell || !cell.source) return '<div class="empty-cell">空单元格</div>';
    const content = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
    if (cell.cell_type === 'markdown') return renderMarkdownCell(content);
    if (cell.cell_type === 'code') return renderCodeCell(content, index, cell.outputs);
    return `<div class="raw-cell"><pre>${escapeHtml(content)}</pre></div>`;
}

// 渲染 Markdown 单元格
function renderMarkdownCell(content) {
    if (typeof marked === 'undefined') return `<div class="markdown-content"><pre>${escapeHtml(content)}</pre></div>`;
    try {
        const mathMap = new Map(), mermaidMap = new Map();
        let counter = 0, protectedContent = content;
        protectedContent = protectedContent.replace(/```mermaid\n([\s\S]+?)```/g, (m, code) => { const p = `MERMAID${counter++}END`; mermaidMap.set(p, code.trim()); return p; });
        protectedContent = protectedContent.replace(/\$\$([\s\S]+?)\$\$/g, m => { const p = `MATH${counter++}END`; mathMap.set(p, m); return p; });
        protectedContent = protectedContent.replace(/\$([^\$\n]+?)\$/g, m => { const p = `MATH${counter++}END`; mathMap.set(p, m); return p; });
        marked.setOptions({ gfm: true, breaks: false, tables: true });
        let html = marked.parse(protectedContent);
        mathMap.forEach((v, k) => { html = html.replace(new RegExp(k, 'g'), v); });
        mermaidMap.forEach((v, k) => { html = html.replace(new RegExp(k, 'g'), `<div class="mermaid-diagram">${escapeHtml(v)}</div>`); });
        return `<div class="markdown-content">${html}</div>`;
    } catch (e) { return `<div class="markdown-content"><pre>${escapeHtml(content)}</pre></div>`; }
}

// 渲染代码单元格
function renderCodeCell(content, index, outputs) {
    const codeId = `code-${index}`;
    let outputsHtml = '';
    if (outputs && outputs.length > 0) {
        outputsHtml = '<div class="code-output">';
        outputs.forEach(o => {
            if (o.output_type === 'stream') {
                const t = Array.isArray(o.text) ? o.text.join('') : o.text;
                outputsHtml += `<div class="output-text"><pre>${escapeHtml(t)}</pre></div>`;
            } else if ((o.output_type === 'execute_result' || o.output_type === 'display_data') && o.data) {
                if (o.data['text/html']) {
                    const h = Array.isArray(o.data['text/html']) ? o.data['text/html'].join('') : o.data['text/html'];
                    outputsHtml += `<div class="output-html output-html-with-script" data-script-pending="true">${h}</div>`;
                } else if (o.data['text/plain']) {
                    const t = Array.isArray(o.data['text/plain']) ? o.data['text/plain'].join('') : o.data['text/plain'];
                    outputsHtml += `<div class="output-text"><pre>${escapeHtml(t)}</pre></div>`;
                }
                if (o.data['image/png']) {
                    outputsHtml += `<div class="output-plot"><img src="data:image/png;base64,${o.data['image/png']}" style="max-width:100%;"></div>`;
                }
            } else if (o.output_type === 'error') {
                const t = o.traceback ? o.traceback.join('\n') : o.evalue || 'Error';
                outputsHtml += `<div class="output-error"><div class="error-title">错误:</div><pre>${escapeHtml(t)}</pre></div>`;
            }
        });
        outputsHtml += '</div>';
    }
    return `<div class="code-wrapper collapsed" data-code-id="${codeId}">
        <div class="code-header">
            <div class="code-header-left">
                <button class="toggle-code-btn" onclick="toggleCode('${codeId}')"><svg class="icon-collapsed" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5l7 7-7 7"/></svg><svg class="icon-expanded" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><path d="M5 9l7 7 7-7"/></svg><span class="toggle-text">显示代码</span></button>
                <span class="code-label">Python</span>
            </div>
            <button class="run-code-btn" onclick="runCode('${codeId}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>运行</button>
        </div>
        <pre class="code-block" style="display:none;"><code data-code="${codeId}">${escapeHtml(content)}</code></pre>
        ${outputsHtml}
        <div class="code-output-dynamic" id="output-${codeId}" style="display:none;"></div>
    </div>`;
}

// 处理文件选择
export async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    state.currentFileName = file.name;
    document.getElementById('file-name').textContent = file.name;
    showLoading();
    try {
        const text = await file.text();
        const notebook = JSON.parse(text);
        state.currentNotebook = notebook;
        await renderNotebook(notebook);
        loadDrawingData();
        showToast('Notebook 加载成功', 'success');
    } catch (error) {
        console.error('加载失败:', error);
        showToast('加载失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 切换代码显示
export function toggleCode(codeId) {
    const w = document.querySelector(`[data-code-id="${codeId}"]`);
    const cb = w.querySelector('.code-block');
    const tb = w.querySelector('.toggle-code-btn');
    const ic = tb.querySelector('.icon-collapsed');
    const ie = tb.querySelector('.icon-expanded');
    const tt = tb.querySelector('.toggle-text');

    if (w.classList.contains('collapsed')) {
        w.classList.remove('collapsed');
        cb.style.display = 'block';
        ic.style.display = 'none';
        ie.style.display = 'inline';
        tt.textContent = '隐藏代码';
    } else {
        w.classList.add('collapsed');
        cb.style.display = 'none';
        ic.style.display = 'inline';
        ie.style.display = 'none';
        tt.textContent = '显示代码';
    }
}
