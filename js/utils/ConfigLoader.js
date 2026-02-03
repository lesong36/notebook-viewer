/**
 * ConfigLoader - 配置加载器
 *
 * 职责：
 * 1. 从外部JSON文件加载配置
 * 2. 提供缓存机制避免重复加载
 * 3. 失败时自动回退到fallback配置
 * 4. 支持配置验证
 *
 * 使用示例：
 * ```javascript
 * const loader = new ConfigLoader();
 *
 * // 加载课程数据库
 * const courses = await loader.loadCourses();
 *
 * // 加载模块配置
 * const modules = await loader.loadModules();
 * ```
 */

class ConfigLoader {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
    this.cache = new Map();
    this.enableCache = options.enableCache !== false;
    this.enableLogging = options.enableLogging || false;
  }

  /**
   * 通用配置加载方法
   * @param {string} configPath - 配置文件路径
   * @param {any} fallback - 加载失败时的回退配置
   * @param {Function} validator - 可选的验证函数
   * @returns {Promise<any>} 配置对象
   */
  async loadConfig(configPath, fallback = null, validator = null) {
    const cacheKey = configPath;

    // 检查缓存
    if (this.enableCache && this.cache.has(cacheKey)) {
      this.log(`✓ 从缓存加载: ${configPath}`);
      return this.cache.get(cacheKey);
    }

    try {
      // 尝试从JSON文件加载
      const url = this.baseUrl + configPath;
      this.log(`⟳ 正在加载: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // 可选验证
      if (validator && !validator(data)) {
        throw new Error('配置验证失败');
      }

      // 缓存配置
      if (this.enableCache) {
        this.cache.set(cacheKey, data);
      }

      this.log(`✓ 成功加载: ${configPath}`);
      return data;

    } catch (error) {
      this.log(`✗ 加载失败: ${configPath} - ${error.message}`);

      if (fallback !== null) {
        this.log(`⟳ 使用fallback配置: ${configPath}`);
        return fallback;
      }

      throw error;
    }
  }

  /**
   * 加载课程数据库
   * @param {Object} fallback - 回退配置（原硬编码的COURSE_DB）
   * @returns {Promise<Object>} 课程对象 { "L2-01": {...}, ... }
   */
  async loadCourses(fallback = null) {
    const config = await this.loadConfig(
      'data/courses.json',
      fallback ? { version: '1.0.0', courses: fallback } : null,
      this.validateCoursesConfig
    );

    return config.courses || config;
  }

  /**
   * 加载模块配置
   * @param {Object} fallback - 回退配置（原硬编码的MODULES）
   * @param {Function} iconMapper - 图标名称到React组件的映射函数
   * @returns {Promise<Object>} 模块对象 { "M1": {...}, ... }
   */
  async loadModules(fallback = null, iconMapper = null) {
    const config = await this.loadConfig(
      'config/modules.json',
      fallback ? { version: '1.0.0', modules: fallback } : null,
      this.validateModulesConfig
    );

    const modules = config.modules || config;

    // 如果提供了图标映射函数，转换图标字段
    if (iconMapper) {
      Object.keys(modules).forEach(key => {
        const iconName = modules[key].icon;
        if (typeof iconName === 'string') {
          modules[key].icon = iconMapper(iconName);
        }
      });
    }

    return modules;
  }

  /**
   * 加载阶段顺序配置
   * @param {Object} fallback - 回退配置（原硬编码的STAGE_ORDER）
   * @returns {Promise<Object>} 阶段顺序对象
   */
  async loadStageOrder(fallback = null) {
    const config = await this.loadConfig(
      'config/stages.json',
      fallback ? { version: '1.0.0', stageOrder: fallback } : null,
      this.validateStageOrderConfig
    );

    return config.stageOrder || config;
  }

  /**
   * 加载课程排序规则
   * @param {Object} fallback - 回退配置（原硬编码的COURSE_SORT_ORDER）
   * @returns {Promise<Object>} 排序规则对象
   */
  async loadCourseSortOrder(fallback = null) {
    const config = await this.loadConfig(
      'config/course-sort.json',
      fallback ? { version: '1.0.0', courseSortOrder: fallback, stageDisplayNames: {}, stageHierarchy: {} } : null
    );

    // 返回整个config对象,包含courseSortOrder、stageDisplayNames和stageHierarchy
    return {
      courseSortOrder: config.courseSortOrder || config,
      stageDisplayNames: config.stageDisplayNames || {},
      stageHierarchy: config.stageHierarchy || {}
    };
  }

  /**
   * 加载绘图工具配置
   * @param {Object} fallback - 回退配置
   * @returns {Promise<Object>} 绘图配置对象
   */
  async loadDrawingConfig(fallback = null) {
    const config = await this.loadConfig(
      'config/drawing.json',
      fallback
    );

    return {
      presetColors: config.presetColors || [],
      lineWidths: config.lineWidths || [],
      defaultColor: config.defaultColor || '#ef4444',
      defaultLineWidth: config.defaultLineWidth || 4,
      defaultTool: config.defaultTool || 'pen'
    };
  }

  /**
   * 加载年级配置
   * @param {Object} fallback - 回退配置
   * @returns {Promise<Array>} 年级配置数组
   */
  async loadGrades(fallback = null) {
    const config = await this.loadConfig(
      'config/grades.json',
      fallback ? { version: '1.0.0', grades: fallback } : null
    );

    return config.grades || config;
  }

  /**
   * 加载应用配置
   * @param {Object} fallback - 回退配置
   * @returns {Promise<Object>} 应用配置对象
   */
  async loadAppConfig(fallback = null) {
    const config = await this.loadConfig(
      'config/app.json',
      fallback
    );

    return {
      appTitle: config.appTitle || '课程体系',
      appName: config.appName || '课程进阶地图',
      appDescription: config.appDescription || '',
      subject: config.subject || '',
      defaultExpandedModules: config.defaultExpandedModules || [],
      ui: config.ui || {}
    };
  }

  /**
   * 加载版本历史
   * @param {Object} fallback - 回退配置
   * @returns {Promise<Array>} 版本历史数组
   */
  async loadVersionHistory(fallback = null) {
    const config = await this.loadConfig(
      'config/version-history.json',
      fallback ? { version: '1.0.0', history: fallback } : null
    );

    return config.history || config;
  }

  /**
   * 批量加载所有核心配置
   * @param {Object} fallbacks - 所有fallback配置对象
   * @param {Function} iconMapper - 图标映射函数
   * @returns {Promise<Object>} 所有配置
   */
  async loadAll(fallbacks = {}, iconMapper = null) {
    try {
      const [courses, modules, stageOrder, courseSortResult, drawingConfig, grades, appConfig, versionHistory] = await Promise.all([
        this.loadCourses(fallbacks.COURSE_DB),
        this.loadModules(fallbacks.MODULES, iconMapper),
        this.loadStageOrder(fallbacks.STAGE_ORDER),
        this.loadCourseSortOrder(fallbacks.COURSE_SORT_ORDER),
        this.loadDrawingConfig(fallbacks.DRAWING),
        this.loadGrades(fallbacks.GRADES),
        this.loadAppConfig(fallbacks.APP),
        this.loadVersionHistory(fallbacks.VERSION_HISTORY)
      ]);

      return {
        courses,
        modules,
        stageOrder,
        courseSortOrder: courseSortResult.courseSortOrder,
        stageDisplayNames: courseSortResult.stageDisplayNames,
        stageHierarchy: courseSortResult.stageHierarchy,
        drawingConfig,
        grades,
        appConfig,
        versionHistory
      };
    } catch (error) {
      console.error('批量加载配置失败:', error);
      throw error;
    }
  }

  /**
   * 验证课程配置格式
   */
  validateCoursesConfig(config) {
    if (!config || typeof config !== 'object') return false;
    if (!config.version || !config.courses) return false;

    // 验证至少有一条课程记录
    const courses = config.courses;
    if (typeof courses !== 'object' || Object.keys(courses).length === 0) {
      return false;
    }

    // 验证第一条记录格式
    const firstCourse = Object.values(courses)[0];
    // 注意：stage 字段已被移除，归属关系由 course-sort.json 决定
    const requiredFields = ['title', 'desc', 'url', 'grade', 'module'];
    return requiredFields.every(field => field in firstCourse);
  }

  /**
   * 验证模块配置格式
   */
  validateModulesConfig(config) {
    if (!config || typeof config !== 'object') return false;
    if (!config.version || !config.modules) return false;

    const modules = config.modules;
    if (typeof modules !== 'object' || Object.keys(modules).length === 0) {
      return false;
    }

    // 验证第一个模块格式
    const firstModule = Object.values(modules)[0];
    const requiredFields = ['title', 'desc', 'icon', 'color'];
    return requiredFields.every(field => field in firstModule);
  }

  /**
   * 验证阶段顺序配置格式
   */
  validateStageOrderConfig(config) {
    if (!config || typeof config !== 'object') return false;
    if (!config.version || !config.stageOrder) return false;

    const stageOrder = config.stageOrder;
    if (typeof stageOrder !== 'object' || Object.keys(stageOrder).length === 0) {
      return false;
    }

    // 验证每个模块的阶段是数组
    return Object.values(stageOrder).every(stages => Array.isArray(stages));
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
    this.log('缓存已清除');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * 日志输出
   */
  log(message) {
    if (this.enableLogging) {
      console.log(`[ConfigLoader] ${message}`);
    }
  }
}

// 导出（支持ES6模块和全局变量两种方式）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConfigLoader;
} else if (typeof window !== 'undefined') {
  window.ConfigLoader = ConfigLoader;
}
