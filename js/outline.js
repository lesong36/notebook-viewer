/**
 * outline.js - 目录大纲功能
 */

import { state } from './config.js';
import { resizeCanvas } from './drawing.js';

// 切换大纲显示
export function toggleOutline() {
    document.getElementById('outline-panel').classList.toggle('collapsed');
    resizeCanvas();
}

// 设置大纲层级
export function setOutlineLevel(level) {
    state.currentOutlineLevel = level;
    document.querySelectorAll('.outline-filter-btn').forEach((btn, i) => {
        btn.classList.toggle('active', (i === 0 && level === 5) || (i === level));
    });
    filterOutlineByLevel(level);
}

// 按层级过滤大纲
export function filterOutlineByLevel(maxLevel) {
    document.querySelectorAll('.outline-item').forEach(item => {
        const levelMatch = item.className.match(/level-(\d)/);
        if (levelMatch) {
            const itemLevel = parseInt(levelMatch[1]);
            item.classList.toggle('hidden', itemLevel > maxLevel);
        }
    });
}

// 构建大纲
export function buildOutline(contentEl) {
    const list = document.getElementById('outline-list');
    const headings = contentEl.querySelectorAll('.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5');

    if (headings.length === 0) {
        list.innerHTML = '<div class="outline-empty">此 Notebook 没有标题</div>';
        return;
    }

    list.innerHTML = '';
    headings.forEach((h, i) => {
        const level = parseInt(h.tagName[1]);
        const id = `heading-${i}`;
        h.id = id;

        const item = document.createElement('a');
        item.className = `outline-item level-${level}`;
        item.href = `#${id}`;
        item.textContent = h.textContent.trim();
        item.title = h.textContent.trim();
        item.onclick = e => {
            e.preventDefault();
            h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        list.appendChild(item);
    });

    filterOutlineByLevel(state.currentOutlineLevel);
}
