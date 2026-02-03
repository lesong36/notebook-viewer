/**
 * Notebook解析工具
 * 用于加载和解析Jupyter Notebook文件,定位特定课程章节
 */

/**
 * 解析notebook文件
 * @param {string} notebookFile - notebook文件名 (如 'L2', 'L3', 'P', 'S', 'G')
 * @returns {Promise<Array>} - 返回cells数组
 */
export async function parseNotebook(notebookFile) {
  try {
    // 添加时间戳参数防止浏览器缓存
    const timestamp = new Date().getTime();
    const response = await fetch(`${notebookFile}.ipynb?t=${timestamp}`, {
      cache: 'no-store'  // 明确禁用缓存
    });
    if (!response.ok) {
      throw new Error(`Failed to load notebook ${notebookFile}.ipynb`);
    }
    const notebook = await response.json();
    return notebook.cells || [];
  } catch (error) {
    console.error(`Error parsing notebook ${notebookFile}:`, error);
    throw error;
  }
}

/**
 * 定位课程章节在notebook中的位置
 * @param {Array} cells - notebook的cells数组
 * @param {string} lessonId - 课程ID (如 'L2-01', 'P-1', 'S1-01', 'G3-04')
 * @returns {Object} - 返回 {start, end} 表示章节的起止索引
 */
export function findLessonSection(cells, lessonId) {
  // 支持课程标题格式：
  // - 有/无冒号：# A1-01: 标题 / # A1-01 标题
  // - 中/英文冒号：: / ：
  // - 加粗：# **A1-01：标题**
  // - 可选模块前缀：# M1 A1-01：标题
  //
  // 课程ID支持任意前缀组合：A/U/G/Z/Q/S/L/P + 年级/编号（如 A1-01, Q6-10, P-0）

  const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedLessonId = escapeRegExp(lessonId);

  // 超级灵活正则: 支持有/无冒号、中/英文冒号、加粗、模块前缀
  // ^#{0,6}\\s* - 行首,0-6个#号,可选空格
  // \\*{0,2}\\s* - 可选**加粗,可选空格
  // (?:M\\d+\\s+)? - 可选M1/M2模块前缀+空格
  // \\*{0,2}\\s* - 可选**加粗,可选空格
  // ${lessonId} - 课程ID
  // \\*{0,2} - 可选**加粗结束
  // (?:\\s*[:\uff1a]|\\s) - 冒号(英文:或中文：)+可选空格 OR 至少一个空格
  const titlePattern = new RegExp(
    `^#{0,6}\\s*\\*{0,2}\\s*(?:M\\d+\\s+)?\\*{0,2}\\s*${escapedLessonId}\\*{0,2}(?:\\s*[:\uff1a]|\\s)`,
    'm'
  );

  // 查找起始位置
  const startIdx = cells.findIndex(cell => {
    if (cell.cell_type !== 'markdown') return false;
    const content = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
    return titlePattern.test(content);
  });

  // 如果没找到,返回全部内容(兜底策略)
  if (startIdx === -1) {
    console.warn(`Chapter "${lessonId}" not found in notebook, showing all content`);
    return {
      start: 0,
      end: cells.length
    };
  }

  // 查找结束位置 (下一个课程的标题)
  // 说明：这里不能只匹配 L/P/S/G，否则像 A1-01 这种新课程会“找不到下一章”，导致把后续多节课都当成笔记内容。
  // 匹配任意课程ID标题行（带捕获组用于排除同一lessonId）
  const nextChapterPattern = /^#{0,6}\s*\*{0,2}\s*(?:M\d+\s+)?\*{0,2}\s*(([A-Z]+\d*)-\d+[A-Z]?)\*{0,2}(?:\s*[:\uff1a]|\s)/m;

  const endIdx = cells.findIndex((cell, idx) => {
    if (idx <= startIdx) return false;
    if (cell.cell_type !== 'markdown') return false;
    const content = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
    const match = content.match(nextChapterPattern);
    if (!match) return false;
    // match[0] is full match; match[1] is full courseId like 'A1-01'
    return match[1] !== lessonId;
  });

  return {
    start: startIdx,
    end: endIdx === -1 ? cells.length : endIdx
  };
}

/**
 * 渲染单个cell
 * @param {Object} cell - notebook cell对象
 * @returns {string} - 返回HTML字符串
 */
export function renderCell(cell) {
  if (!cell || !cell.source) {
    return '';
  }

  const content = Array.isArray(cell.source)
    ? cell.source.join('')
    : cell.source;

  if (cell.cell_type === 'markdown') {
    // 使用marked库渲染Markdown
    // 注意: marked需要在HTML中通过CDN引入
    if (typeof marked !== 'undefined') {
      return marked.parse(content);
    } else {
      // 降级方案: 直接显示原始内容
      return `<div class="markdown-fallback">${content.replace(/\n/g, '<br>')}</div>`;
    }
  } else if (cell.cell_type === 'code') {
    // 代码块渲染
    return `<pre class="code-cell"><code>${escapeHtml(content)}</code></pre>`;
  } else {
    // 其他类型cell
    return `<div class="cell-${cell.cell_type}">${escapeHtml(content)}</div>`;
  }
}

/**
 * HTML转义函数,防止XSS攻击
 * @param {string} text - 待转义的文本
 * @returns {string} - 转义后的文本
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
 * 批量渲染cells
 * @param {Array} cells - cells数组
 * @returns {string} - 返回HTML字符串
 */
export function renderCells(cells) {
  return cells.map(renderCell).join('\n');
}

/**
 * 从notebook中提取所有课程
 * @param {Array} cells - notebook的cells数组
 * @returns {Array} - 返回课程对象数组 [{id, title, desc, grade}, ...]
 */
export function extractAllCourses(cells) {
  const courses = [];

  // 匹配课程标题的正则表达式
  // 支持格式:
  // - 有冒号: # L2-01: 标题 或 # L2-11：标题 或 # **L2-21：标题**
  // - 无冒号: # L5-01 标题 或 # L6-01 标题 (仅用空格分隔)
  // - 支持所有前缀: A, U, G, Z, Q, S, L, P + 任意年级数字
  // - 使用更通用的模式: [A-Z]+\d*-\d+[A-Z]? 匹配任意前缀组合
  const coursePattern = /^#{1,6}\s*\*{0,2}\s*(?:M\d+\s+)?\*{0,2}\s*((?:[A-Z]+\d*)-\d+[A-Z]?)\*{0,2}(?:\s*[:\uff1a]|\s)\s*(.+?)(?:\*{0,2})$/m;

  cells.forEach((cell, index) => {
    if (cell.cell_type !== 'markdown') return;

    const content = Array.isArray(cell.source)
      ? cell.source.join('')
      : cell.source;

    const match = content.match(coursePattern);
    if (match) {
      const courseId = match[1].trim();
      const title = match[2].trim().replace(/\*+/g, ''); // 移除可能的加粗标记

      // 提取年级信息
      // 支持所有前缀: A1-01, U3-05, G4-02, Z5-01, Q2-03, S6-01, L2-01, P-1
      let grade = '';
      const gradeMatch = courseId.match(/[A-Z]+(\d+)-/);
      if (gradeMatch) {
        grade = gradeMatch[1];
      } else if (courseId.startsWith('P-')) {
        grade = '预备';
      }

      // 尝试提取描述（查找标题后的第一段文本）
      let desc = '';
      if (index + 1 < cells.length && cells[index + 1].cell_type === 'markdown') {
        const nextContent = Array.isArray(cells[index + 1].source)
          ? cells[index + 1].source.join('')
          : cells[index + 1].source;

        // 提取第一行非标题文本作为描述
        const lines = nextContent.split('\n').filter(line =>
          line.trim() && !line.trim().startsWith('#')
        );
        if (lines.length > 0) {
          desc = lines[0].trim().substring(0, 100); // 限制长度
        }
      }

      courses.push({
        id: courseId,
        title: title,
        desc: desc || `${title}的详细内容`,
        grade: grade,
        url: `html/${courseId}.html` // 默认URL格式
      });
    }
  });

  return courses;
}

/**
 * 从File对象解析notebook并提取课程
 * @param {File} file - 用户上传的.ipynb文件
 * @returns {Promise<Array>} - 返回课程对象数组
 */
export async function parseNotebookFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const notebook = JSON.parse(e.target.result);
        const cells = notebook.cells || [];
        const courses = extractAllCourses(cells);
        resolve(courses);
      } catch (error) {
        console.error('解析notebook文件失败:', error);
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.readAsText(file);
  });
}
