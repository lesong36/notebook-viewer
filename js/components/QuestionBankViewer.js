/**
 * QuestionBankViewer组件
 * 负责加载和渲染练习题库内容
 * 支持题目高亮标记功能
 */

/**
 * 创建练习题查看器
 * @param {string} lessonId - 课程ID (如 'L3-01')
 * @param {HTMLElement} container - 容器DOM元素
 * @returns {Promise<void>}
 */
export async function createQuestionBankViewer(lessonId, container) {
  // 清空容器
  container.innerHTML = '';

  // 创建加载提示
  showLoadingState(container);

  try {
    // 1. 解析lessonId获取年级和课程号
    const { grade, lessonNum, sectionId } = parseLessonId(lessonId);

    // 2. 加载题库JSON
    const questions = await loadQuestionBank(grade);

    // 3. 过滤当前section的题目
    const sectionQuestions = filterQuestionsBySection(questions, sectionId);

    // 4. 移除加载提示
    container.innerHTML = '';

    // 5. 如果没有题目，显示空状态
    if (sectionQuestions.length === 0) {
      showEmptyState(container, lessonId);
      return;
    }

    // 6. 加载高亮状态
    const highlightedQuestions = loadHighlightedQuestions();

    // 7. 创建题库容器
    const bankContainer = document.createElement('div');
    bankContainer.className = 'question-bank-container';

    // 8. 创建状态对象（用于筛选）
    let showOnlyHighlighted = false;

    // 9. 计算高亮题目数量
    const highlightedCount = sectionQuestions.filter(q =>
      highlightedQuestions.has(q.id)
    ).length;

    // 10. 创建标题和工具栏
    const headerEl = document.createElement('div');
    headerEl.className = 'question-bank-header';

    const headerContent = document.createElement('div');
    headerContent.className = 'header-content';
    headerContent.innerHTML = `
      <div class="header-icon">📝</div>
      <h2 class="header-title">${lessonId} 练习题</h2>
      <div class="header-meta">
        共 ${sectionQuestions.length} 道题
        ${highlightedCount > 0 ? `<span class="highlight-count">⭐ ${highlightedCount} 道已标记</span>` : ''}
      </div>
    `;
    headerEl.appendChild(headerContent);

    // 11. 创建工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'question-toolbar';

    // 筛选按钮
    const filterButton = document.createElement('button');
    filterButton.className = 'filter-button';
    filterButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      <span class="filter-text">全部题目</span>
    `;
    filterButton.title = '切换显示：全部题目 / 仅已标记';

    filterButton.addEventListener('click', () => {
      showOnlyHighlighted = !showOnlyHighlighted;
      filterButton.classList.toggle('active', showOnlyHighlighted);
      filterButton.querySelector('.filter-text').textContent =
        showOnlyHighlighted ? '已标记题目' : '全部题目';

      // 重新渲染题目列表
      renderQuestionList(
        sectionQuestions,
        listEl,
        highlightedQuestions,
        showOnlyHighlighted
      );
    });

    toolbar.appendChild(filterButton);

    // 清除所有高亮按钮（仅在有高亮题目时显示）
    if (highlightedCount > 0) {
      const clearButton = document.createElement('button');
      clearButton.className = 'clear-highlights-button';
      clearButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
        <span>清除标记</span>
      `;
      clearButton.title = '清除本课程所有标记';

      clearButton.addEventListener('click', () => {
        if (confirm(`确定要清除 ${lessonId} 的所有 ${highlightedCount} 个标记吗？`)) {
          // 清除当前section的所有高亮
          sectionQuestions.forEach(q => {
            highlightedQuestions.delete(q.id);
          });
          saveHighlightedQuestions(highlightedQuestions);

          // 重新加载视图
          createQuestionBankViewer(lessonId, container);
        }
      });

      toolbar.appendChild(clearButton);
    }

    headerEl.appendChild(toolbar);
    bankContainer.appendChild(headerEl);

    // 12. 创建题目列表容器
    const listEl = document.createElement('div');
    listEl.className = 'question-list';
    bankContainer.appendChild(listEl);

    // 13. 渲染题目列表
    renderQuestionList(
      sectionQuestions,
      listEl,
      highlightedQuestions,
      showOnlyHighlighted
    );

    container.appendChild(bankContainer);

    // 14. 渲染LaTeX公式
    renderMath(container);

  } catch (error) {
    // 错误处理
    container.innerHTML = '';
    showErrorState(container, error);
    console.error('Failed to load question bank:', error);
  }
}

/**
 * 渲染题目列表
 * @param {Array} questions - 题目数组
 * @param {HTMLElement} listEl - 列表容器
 * @param {Set} highlightedQuestions - 高亮题目集合
 * @param {boolean} showOnlyHighlighted - 是否只显示高亮题目
 */
function renderQuestionList(questions, listEl, highlightedQuestions, showOnlyHighlighted) {
  // 清空列表
  listEl.innerHTML = '';

  // 过滤题目
  const filteredQuestions = showOnlyHighlighted
    ? questions.filter(q => highlightedQuestions.has(q.id))
    : questions;

  // 如果筛选后没有题目
  if (filteredQuestions.length === 0 && showOnlyHighlighted) {
    const emptyHint = document.createElement('div');
    emptyHint.className = 'filter-empty-hint';
    emptyHint.innerHTML = `
      <div class="empty-icon">⭐</div>
      <p>还没有标记任何题目</p>
      <p class="hint-text">点击题目旁的星标按钮来标记重要题目</p>
    `;
    listEl.appendChild(emptyHint);
    return;
  }

  // 渲染题目
  filteredQuestions.forEach((question, index) => {
    const questionEl = createQuestionElement(
      question,
      index + 1,
      highlightedQuestions
    );
    listEl.appendChild(questionEl);
  });
}

/**
 * 解析课程ID
 * @param {string} lessonId - 课程ID (如 'L3-01', 'L3-10')
 * @returns {Object} {grade: 'L3', lessonNum: 1, sectionId: 'L3-01'}
 */
function parseLessonId(lessonId) {
  // L3-01 → {grade: 'L3', lessonNum: 1, sectionId: 'L3-01'}
  const match = lessonId.match(/^(L\d+)-(\d+)$/);
  if (!match) {
    throw new Error(`Invalid lesson ID format: ${lessonId}`);
  }

  return {
    grade: match[1],           // 'L3'
    lessonNum: parseInt(match[2], 10),  // 1
    sectionId: lessonId        // 'L3-01'
  };
}

/**
 * 加载题库JSON文件
 * @param {string} grade - 年级 (如 'L3')
 * @returns {Promise<Array>} 题目数组
 */
async function loadQuestionBank(grade) {
  // 添加时间戳防止浏览器缓存
  const timestamp = Date.now();
  const response = await fetch(`question bank/${grade}.json?v=${timestamp}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`题库文件不存在: question bank/${grade}.json`);
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('题库数据格式错误：应为数组');
  }

  return data;
}

/**
 * 过滤section的题目
 * @param {Array} questions - 所有题目
 * @param {string} sectionId - section ID (如 'L3-01')
 * @returns {Array} 过滤后的题目
 */
function filterQuestionsBySection(questions, sectionId) {
  // 数据迁移后，section字段已经是 "L3-01" 格式，直接匹配即可
  return questions.filter(q => q.section === sectionId);
}

/**
 * 创建单个题目元素
 * @param {Object} question - 题目对象
 * @param {number} number - 题号
 * @param {Set} highlightedQuestions - 高亮题目集合
 * @returns {HTMLElement}
 */
function createQuestionElement(question, number, highlightedQuestions) {
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question-item';
  questionDiv.dataset.questionId = question.id;

  // 如果题目被高亮，添加highlighted类
  const isHighlighted = highlightedQuestions.has(question.id);
  if (isHighlighted) {
    questionDiv.classList.add('highlighted');
  }

  // 创建题目头部（题号 + 题型标签 + 高亮按钮）
  const headerDiv = document.createElement('div');
  headerDiv.className = 'question-header';

  const leftGroup = document.createElement('div');
  leftGroup.className = 'header-left';

  const numberSpan = document.createElement('span');
  numberSpan.className = 'question-number';
  numberSpan.textContent = `第${number}题`;

  const typeTag = document.createElement('span');
  typeTag.className = 'question-type-tag';
  typeTag.textContent = question.type;

  leftGroup.appendChild(numberSpan);
  leftGroup.appendChild(typeTag);

  // 高亮按钮
  const highlightBtn = document.createElement('button');
  highlightBtn.className = 'highlight-button';
  highlightBtn.title = isHighlighted ? '取消标记' : '标记此题';
  highlightBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="${isHighlighted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  `;

  if (isHighlighted) {
    highlightBtn.classList.add('active');
  }

  // 高亮按钮点击事件
  highlightBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    const currentHighlights = loadHighlightedQuestions();

    if (currentHighlights.has(question.id)) {
      // 取消高亮
      currentHighlights.delete(question.id);
      questionDiv.classList.remove('highlighted');
      highlightBtn.classList.remove('active');
      highlightBtn.title = '标记此题';
      highlightBtn.querySelector('svg').setAttribute('fill', 'none');
    } else {
      // 添加高亮
      currentHighlights.add(question.id);
      questionDiv.classList.add('highlighted');
      highlightBtn.classList.add('active');
      highlightBtn.title = '取消标记';
      highlightBtn.querySelector('svg').setAttribute('fill', 'currentColor');
    }

    saveHighlightedQuestions(currentHighlights);

    // 更新header中的计数
    updateHighlightCount();
  });

  headerDiv.appendChild(leftGroup);
  headerDiv.appendChild(highlightBtn);
  questionDiv.appendChild(headerDiv);

  // 创建题目内容
  const contentDiv = document.createElement('div');
  contentDiv.className = 'question-content';
  contentDiv.innerHTML = question.content_latex || '';
  questionDiv.appendChild(contentDiv);

  // 如果有图片，添加图片元素
  if (question.graphic_content && question.graphic_content.trim()) {
    const imgEl = createImageElement(question.graphic_content);
    if (imgEl) {
      questionDiv.appendChild(imgEl);
    }
  }

  return questionDiv;
}

/**
 * 更新header中的高亮计数（动态更新）
 */
function updateHighlightCount() {
  const headerMeta = document.querySelector('.header-meta');
  if (!headerMeta) return;

  const highlightedQuestions = loadHighlightedQuestions();
  const allQuestions = document.querySelectorAll('.question-item');
  const sectionHighlightedCount = Array.from(allQuestions).filter(el =>
    highlightedQuestions.has(el.dataset.questionId)
  ).length;

  const existingCount = headerMeta.querySelector('.highlight-count');

  if (sectionHighlightedCount > 0) {
    const countHTML = `<span class="highlight-count">⭐ ${sectionHighlightedCount} 道已标记</span>`;
    if (existingCount) {
      existingCount.outerHTML = countHTML;
    } else {
      headerMeta.insertAdjacentHTML('beforeend', countHTML);
    }
  } else {
    if (existingCount) {
      existingCount.remove();
    }
  }
}

/**
 * 加载高亮题目集合
 * @returns {Set} 高亮题目ID集合
 */
function loadHighlightedQuestions() {
  const stored = localStorage.getItem('highlightedQuestions');
  if (!stored) return new Set();

  try {
    const array = JSON.parse(stored);
    return new Set(array);
  } catch (e) {
    console.error('Failed to parse highlighted questions:', e);
    return new Set();
  }
}

/**
 * 保存高亮题目集合
 * @param {Set} highlightedQuestions - 高亮题目ID集合
 */
function saveHighlightedQuestions(highlightedQuestions) {
  const array = Array.from(highlightedQuestions);
  localStorage.setItem('highlightedQuestions', JSON.stringify(array));
}

/**
 * 创建图片元素
 * @param {string} graphicContent - 图片内容字符串 (如 "(images/L3-10-1.png)")
 * @returns {HTMLElement|null}
 */
function createImageElement(graphicContent) {
  // 提取图片路径：(images/L3-10-1.png) → images/L3-10-1.png
  const match = graphicContent.match(/\((.+?)\)/);
  if (!match) {
    return null;
  }

  const imagePath = match[1];  // images/L3-10-1.png
  const fullPath = `question bank/${imagePath}`;  // question bank/images/L3-10-1.png

  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'question-image-wrapper';

  const img = document.createElement('img');
  img.className = 'question-image';
  img.src = fullPath;
  img.alt = '题目配图';

  // 图片加载错误处理
  img.addEventListener('error', function() {
    // 创建占位符
    const placeholder = document.createElement('div');
    placeholder.className = 'image-error';
    placeholder.innerHTML = `
      <div class="error-icon">🖼️</div>
      <div class="error-text">图片加载失败</div>
      <div class="error-hint">${imagePath}</div>
    `;
    // 替换图片
    imgWrapper.replaceChild(placeholder, img);
  });

  imgWrapper.appendChild(img);
  return imgWrapper;
}

/**
 * 渲染LaTeX公式
 * @param {HTMLElement} container - 容器
 */
function renderMath(container) {
  // 使用KaTeX渲染数学公式
  if (typeof renderMathInElement !== 'undefined') {
    try {
      renderMathInElement(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false,  // 容错处理
        strict: false
      });
    } catch (e) {
      console.warn('KaTeX rendering error:', e);
    }
  } else {
    console.warn('KaTeX not loaded, math formulas will not be rendered');
  }
}

/**
 * 显示加载状态
 * @param {HTMLElement} container
 */
function showLoadingState(container) {
  const loadingEl = document.createElement('div');
  loadingEl.className = 'question-loading';
  loadingEl.innerHTML = `
    <div class="loading-spinner"></div>
    <p>加载练习题中...</p>
  `;
  container.appendChild(loadingEl);
}

/**
 * 显示空状态
 * @param {HTMLElement} container
 * @param {string} lessonId
 */
function showEmptyState(container, lessonId) {
  const emptyEl = document.createElement('div');
  emptyEl.className = 'question-empty';
  emptyEl.innerHTML = `
    <div class="empty-icon">📭</div>
    <h3>暂无练习题</h3>
    <p>${lessonId} 课程的练习题正在准备中</p>
    <p class="empty-hint">请选择其他视图查看课程内容</p>
  `;
  container.appendChild(emptyEl);
}

/**
 * 显示错误状态
 * @param {HTMLElement} container
 * @param {Error} error
 */
function showErrorState(container, error) {
  const errorEl = document.createElement('div');
  errorEl.className = 'question-error';
  errorEl.innerHTML = `
    <div class="error-icon">❌</div>
    <h3>加载失败</h3>
    <p>${error.message}</p>
    <div class="error-hint">
      <strong>可能的原因：</strong>
      <ul>
        <li>题库文件不存在或路径错误</li>
        <li>网络连接问题</li>
        <li>数据格式错误</li>
      </ul>
    </div>
    <button onclick="location.reload()" class="retry-button">重新加载</button>
  `;
  container.appendChild(errorEl);
}
