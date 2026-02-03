/**
 * AdminApp - 配置管理应用根组件
 * MVP版本：实现配置加载、筛选、基本展示和CRUD操作
 */

const { useState, useEffect, useReducer, useMemo } = React;

// ========== 状态管理 ==========

const initialState = {
  config: null,
  loading: true,
  error: null,
  isDirty: false,

  // 双维度筛选
  filters: {
    module: 'all',
    grade: 'all',
    sortBy: 'module'
  },

  // UI状态
  selectedCourse: null,
  expandedModules: new Set(),  // 改名：expandedStages -> expandedModules
  showEditModal: false,
  editingCourse: null,
  isSaving: false,
  validationErrors: [],

  // 课程库状态
  courseLibrary: [],
  showCourseLibrary: false,
  libraryFileName: null,

  // 层级编辑状态
  showModuleEditor: false,
  editingNode: null,        // 当前编辑的节点(模块)
  editingNodePath: null     // 节点路径,如 "M1.M1-1.SSM1"
};

function configReducer(state, action) {
  switch (action.type) {
    case 'LOAD_CONFIG':
      return { ...state, config: action.payload, loading: false };

    case 'LOAD_ERROR':
      return { ...state, error: action.payload, loading: false };

    case 'SET_FILTER':
      return {
        ...state,
        filters: { ...state.filters, [action.field]: action.value }
      };

    case 'RESET_FILTERS':
      return {
        ...state,
        filters: { module: 'all', grade: 'all', sortBy: 'module' }
      };

    case 'TOGGLE_MODULE':
      const newExpanded = new Set(state.expandedModules);
      if (newExpanded.has(action.moduleId)) {
        newExpanded.delete(action.moduleId);
      } else {
        newExpanded.add(action.moduleId);
      }
      return { ...state, expandedModules: newExpanded };

    case 'OPEN_EDIT_MODAL':
      return {
        ...state,
        showEditModal: true,
        editingCourse: action.course || null
      };

    case 'CLOSE_EDIT_MODAL':
      return {
        ...state,
        showEditModal: false,
        editingCourse: null
      };

    case 'UPDATE_COURSE': {
      const { modulePath, courseIndex, courseData } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));
      const module = findNodeByPath(newConfig, modulePath);

      if (!module) {
        console.error(`找不到模块: ${modulePath}`);
        return state;
      }

      // 收集所有课程（包括从stages迁移的课程）
      let allCourses = [];

      // 新格式的courses
      if (module.courses && Array.isArray(module.courses)) {
        allCourses.push(...module.courses);
      }

      // 旧格式的stages - 迁移到courses数组
      if (module.stages && Array.isArray(module.stages)) {
        module.stages.forEach(stage => {
          if (stage.courses && Array.isArray(stage.courses)) {
            allCourses.push(...stage.courses);
          }
        });
        // 清空stages，完成迁移
        delete module.stages;
      }

      if (courseIndex === -1) {
        // 新建课程
        allCourses.push(courseData);
      } else {
        // 更新课程
        if (courseIndex >= allCourses.length) {
          console.error(`课程索引无效: ${courseIndex}`);
          return state;
        }
        allCourses[courseIndex] = courseData;
      }

      module.courses = allCourses;

      return { ...state, config: newConfig, isDirty: true, showEditModal: false };
    }

    case 'DELETE_COURSE': {
      const { modulePath, courseIndex } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));
      const module = findNodeByPath(newConfig, modulePath);

      if (!module) {
        console.error(`找不到模块: ${modulePath}`);
        return state;
      }

      // 收集所有课程（包括从stages迁移的课程）
      let allCourses = [];

      // 新格式的courses
      if (module.courses && Array.isArray(module.courses)) {
        allCourses.push(...module.courses);
      }

      // 旧格式的stages - 迁移到courses数组
      if (module.stages && Array.isArray(module.stages)) {
        module.stages.forEach(stage => {
          if (stage.courses && Array.isArray(stage.courses)) {
            allCourses.push(...stage.courses);
          }
        });
        // 清空stages，完成迁移
        delete module.stages;
      }

      if (allCourses.length === 0 || courseIndex >= allCourses.length) {
        console.error(`课程索引无效: ${courseIndex}`);
        return state;
      }

      // 删除课程
      allCourses.splice(courseIndex, 1);
      module.courses = allCourses;

      return { ...state, config: newConfig, isDirty: true };
    }

    case 'SET_SAVING':
      return { ...state, isSaving: action.value };

    case 'MARK_SAVED':
      return { ...state, isDirty: false };

    case 'SET_VALIDATION_ERRORS':
      return { ...state, validationErrors: action.errors };

    case 'REORDER_COURSES': {
      const { modulePath, sourceIndex, destinationIndex } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));
      const module = findNodeByPath(newConfig, modulePath);

      if (!module) {
        console.error(`找不到模块: ${modulePath}`);
        return state;
      }

      // 收集所有课程（包括从stages迁移的课程）
      let allCourses = [];

      // 新格式的courses
      if (module.courses && Array.isArray(module.courses)) {
        allCourses.push(...module.courses);
      }

      // 旧格式的stages - 迁移到courses数组
      if (module.stages && Array.isArray(module.stages)) {
        module.stages.forEach(stage => {
          if (stage.courses && Array.isArray(stage.courses)) {
            allCourses.push(...stage.courses);
          }
        });
        // 清空stages，完成迁移
        delete module.stages;
      }

      // 执行重排序
      if (allCourses.length === 0) {
        console.error(`模块 ${modulePath} 没有课程`);
        return state;
      }

      const [removed] = allCourses.splice(sourceIndex, 1);
      allCourses.splice(destinationIndex, 0, removed);

      // 更新模块的courses数组
      module.courses = allCourses;

      return { ...state, config: newConfig, isDirty: true };
    }

    case 'REORDER_SUBMODULES': {
      const { parentPath, sourceIndex, destinationIndex } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));

      // 使用路径查找父模块
      const parent = findNodeByPath(newConfig, parentPath);

      if (!parent || !parent.children) {
        console.error(`找不到父模块或子模块: ${parentPath}`);
        return state;
      }

      // 在children数组中移动子模块
      const [removed] = parent.children.splice(sourceIndex, 1);
      parent.children.splice(destinationIndex, 0, removed);

      return { ...state, config: newConfig, isDirty: true };
    }

    case 'REORDER_TOP_MODULES': {
      const { sourceIndex, destinationIndex } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));

      // 在顶层modules数组中移动模块
      if (!newConfig.modules || sourceIndex >= newConfig.modules.length || destinationIndex >= newConfig.modules.length) {
        console.error(`无效的模块索引: source=${sourceIndex}, destination=${destinationIndex}`);
        return state;
      }

      const [removed] = newConfig.modules.splice(sourceIndex, 1);
      newConfig.modules.splice(destinationIndex, 0, removed);

      return { ...state, config: newConfig, isDirty: true };
    }

    case 'LOAD_COURSE_LIBRARY':
      return {
        ...state,
        courseLibrary: action.payload.courses,
        libraryFileName: action.payload.fileName,
        showCourseLibrary: true
      };

    case 'TOGGLE_COURSE_LIBRARY':
      return { ...state, showCourseLibrary: !state.showCourseLibrary };

    case 'ADD_COURSE_FROM_LIBRARY': {
      const { modulePath, courseData } = action.payload;
      console.log('🎯 [ADD_COURSE_FROM_LIBRARY] 开始处理:', {
        modulePath,
        courseId: courseData.id,
        courseTitle: courseData.title
      });

      const newConfig = JSON.parse(JSON.stringify(state.config));

      // 使用路径查找模块(支持嵌套模块)
      const module = findNodeByPath(newConfig, modulePath);

      if (!module) {
        console.error(`找不到模块: ${modulePath}`);
        return state;
      }

      // 收集配置中所有课程的位置(不仅仅是重复的)
      const allCourseLocations = new Map();
      console.log('📚 开始收集配置中的所有课程位置...');

      function collectAllCourseLocations(mod, modPath = '') {
        const currentPath = modPath || mod.id || mod.name;

        if (mod.courses && Array.isArray(mod.courses)) {
          mod.courses.forEach(course => {
            if (!allCourseLocations.has(course.id)) {
              allCourseLocations.set(course.id, []);
            }
            allCourseLocations.get(course.id).push({
              path: currentPath,
              moduleName: mod.title || mod.name || mod.id
            });
          });
        }

        // 兼容旧格式: stages
        if (mod.stages && Array.isArray(mod.stages)) {
          mod.stages.forEach(stage => {
            if (stage.courses && Array.isArray(stage.courses)) {
              stage.courses.forEach(course => {
                if (!allCourseLocations.has(course.id)) {
                  allCourseLocations.set(course.id, []);
                }
                allCourseLocations.get(course.id).push({
                  path: `${currentPath} → ${stage.name}`,
                  moduleName: mod.title || mod.name || mod.id,
                  stageName: stage.name
                });
              });
            }
          });
        }

        if (mod.children && Array.isArray(mod.children)) {
          mod.children.forEach(child => {
            collectAllCourseLocations(child, `${currentPath}.${child.id || child.name}`);
          });
        }
      }

      if (newConfig && newConfig.modules) {
        newConfig.modules.forEach(mod => collectAllCourseLocations(mod));
      }

      console.log('✅ 收集完成，总共找到课程数:', allCourseLocations.size);
      console.log('🔍 检查课程是否已存在:', courseData.id);

      // 检查课程是否已存在于配置中的任何位置
      if (allCourseLocations.has(courseData.id)) {
        const locations = allCourseLocations.get(courseData.id);
        console.error('❌ 课程重复！', {
          courseId: courseData.id,
          existingLocations: locations
        });
        const locationList = locations
          .map(loc => `  • ${loc.path}${loc.stageName ? ` (${loc.stageName})` : ''}`)
          .join('\n');
        alert(`❌ 课程 ${courseData.id} 已存在于以下位置:\n\n${locationList}\n\n根据排他性规则,同一课程只能存在于一个模块/子模块中。`);
        return state;
      }

      console.log('✅ 课程不存在，允许添加');

      if (!module.courses) module.courses = [];

      module.courses.push(courseData);
      return { ...state, config: newConfig, isDirty: true };
    }

    // ========== 层级编辑 Actions ==========

    case 'OPEN_MODULE_EDITOR':
      return {
        ...state,
        showModuleEditor: true,
        editingNode: action.payload.node || null,
        editingNodePath: action.payload.path || null
      };

    case 'CLOSE_MODULE_EDITOR':
      return {
        ...state,
        showModuleEditor: false,
        editingNode: null,
        editingNodePath: null
      };


    case 'ADD_MODULE': {
      const { parentPath, moduleData } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));
      const newExpanded = new Set(state.expandedModules);

      if (!parentPath) {
        // 添加顶层模块
        newConfig.modules.push({
          type: 'module',
          ...moduleData,
          children: []
        });
      } else {
        // 添加子模块
        const parent = findNodeByPath(newConfig, parentPath);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push({
            type: 'module',
            ...moduleData,
            children: []
          });
          // 自动展开父模块，使新创建的子模块可见
          newExpanded.add(parentPath);
        }
      }

      return { ...state, config: newConfig, isDirty: true, showModuleEditor: false, expandedModules: newExpanded };
    }

    case 'UPDATE_MODULE': {
      const { path, moduleData } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));
      const node = findNodeByPath(newConfig, path);

      if (node) {
        Object.assign(node, moduleData);
      }

      return { ...state, config: newConfig, isDirty: true, showModuleEditor: false };
    }

    case 'DELETE_MODULE': {
      const { path } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));
      deleteNodeByPath(newConfig, path);

      return { ...state, config: newConfig, isDirty: true };
    }

    case 'MOVE_COURSE_BETWEEN_MODULES': {
      const { sourceModulePath, destModulePath, courseIndex } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));

      // 找到源模块和目标模块
      const sourceModule = findNodeByPath(newConfig, sourceModulePath);
      const destModule = findNodeByPath(newConfig, destModulePath);

      if (!sourceModule) {
        console.error(`找不到源模块: ${sourceModulePath}`);
        return state;
      }

      if (!destModule) {
        console.error(`找不到目标模块: ${destModulePath}`);
        return state;
      }

      // 收集源模块的所有课程
      let sourceCourses = [];
      if (sourceModule.courses && Array.isArray(sourceModule.courses)) {
        sourceCourses.push(...sourceModule.courses);
      }
      if (sourceModule.stages && Array.isArray(sourceModule.stages)) {
        sourceModule.stages.forEach(stage => {
          if (stage.courses && Array.isArray(stage.courses)) {
            sourceCourses.push(...stage.courses);
          }
        });
        delete sourceModule.stages;
      }

      // 验证索引并获取课程
      if (courseIndex >= sourceCourses.length) {
        console.error(`课程索引无效: ${courseIndex}`);
        return state;
      }

      const courseToMove = sourceCourses[courseIndex];

      // 跨模块移动前检查排他性
      const allCourseLocations = new Map();
      function collectAllCourseLocations(mod, modPath = '') {
        const currentPath = modPath || mod.id || mod.name;

        if (mod.courses && Array.isArray(mod.courses)) {
          mod.courses.forEach(course => {
            if (!allCourseLocations.has(course.id)) {
              allCourseLocations.set(course.id, []);
            }
            allCourseLocations.get(course.id).push({
              path: currentPath,
              moduleName: mod.title || mod.name || mod.id
            });
          });
        }

        if (mod.stages && Array.isArray(mod.stages)) {
          mod.stages.forEach(stage => {
            if (stage.courses && Array.isArray(stage.courses)) {
              stage.courses.forEach(course => {
                if (!allCourseLocations.has(course.id)) {
                  allCourseLocations.set(course.id, []);
                }
                allCourseLocations.get(course.id).push({
                  path: `${currentPath} → ${stage.name}`,
                  moduleName: mod.title || mod.name || mod.id,
                  stageName: stage.name
                });
              });
            }
          });
        }

        if (mod.children && Array.isArray(mod.children)) {
          mod.children.forEach(child => {
            collectAllCourseLocations(child, `${currentPath}.${child.id || child.name}`);
          });
        }
      }

      if (newConfig && newConfig.modules) {
        newConfig.modules.forEach(mod => collectAllCourseLocations(mod));
      }

      // 检查目标模块是否已有此课程(排除源模块的情况)
      if (allCourseLocations.has(courseToMove.id)) {
        const locations = allCourseLocations.get(courseToMove.id).filter(loc => loc.path !== sourceModulePath);
        if (locations.length > 0) {
          const locationList = locations
            .map(loc => `  • ${loc.path}${loc.stageName ? ` (${loc.stageName})` : ''}`)
            .join('\n');
          alert(`❌ 课程 ${courseToMove.id} 已存在于以下位置:\n\n${locationList}\n\n根据排他性规则，同一课程只能存在于一个模块/子模块中。`);
          return state;
        }
      }

      // 从源模块删除课程
      sourceCourses.splice(courseIndex, 1);
      sourceModule.courses = sourceCourses;

      // 添加到目标模块
      if (!destModule.courses) destModule.courses = [];
      destModule.courses.push(courseToMove);

      console.log('✅ 课程跨模块移动成功:', {
        courseId: courseToMove.id,
        from: sourceModulePath,
        to: destModulePath
      });

      return { ...state, config: newConfig, isDirty: true };
    }

    case 'MOVE_STAGE_BETWEEN_MODULES': {
      const { sourceParentPath, destParentPath, stageIndex, destinationIndex, stageId } = action.payload;
      const newConfig = JSON.parse(JSON.stringify(state.config));

      // 找到源父模块和目标父模块
      const sourceParent = findNodeByPath(newConfig, sourceParentPath);
      const destParent = findNodeByPath(newConfig, destParentPath);

      if (!sourceParent || !sourceParent.children) {
        console.error(`找不到源父模块或其children: ${sourceParentPath}`);
        return state;
      }

      if (!destParent) {
        console.error(`找不到目标父模块: ${destParentPath}`);
        return state;
      }

      // 验证索引并获取要移动的子模块
      if (stageIndex >= sourceParent.children.length) {
        console.error(`子模块索引无效: ${stageIndex}`);
        return state;
      }

      const stageToMove = sourceParent.children[stageIndex];

      // 验证stageId匹配
      if (stageToMove.id !== stageId) {
        console.error(`子模块ID不匹配: 期望 ${stageId}, 实际 ${stageToMove.id}`);
        return state;
      }

      // 从源父模块删除子模块
      sourceParent.children.splice(stageIndex, 1);

      // 添加到目标父模块
      if (!destParent.children) {
        destParent.children = [];
      }

      // 如果指定了destinationIndex,则插入到该位置,否则添加到末尾
      if (destinationIndex !== undefined && destinationIndex >= 0) {
        destParent.children.splice(destinationIndex, 0, stageToMove);
      } else {
        destParent.children.push(stageToMove);
      }

      console.log('✅ 子模块跨Module移动成功:', {
        stageId: stageToMove.id,
        stageTitle: stageToMove.title || stageToMove.name,
        from: sourceParentPath,
        to: destParentPath
      });

      return { ...state, config: newConfig, isDirty: true };
    }

    default:
      return state;
  }
}

// ========== 工具函数 ==========

/**
 * 根据路径查找节点
 * @param {Object} config - 配置对象
 * @param {String} path - 节点路径,如 "M1" 或 "M1.SM1" 或 "M1.SM1.SSM1"
 * @returns {Object|null} - 找到的节点
 */
function findNodeByPath(config, path) {
  if (!path) return null;

  const parts = path.split('.');
  let current = config.modules.find(m => m.id === parts[0]);

  for (let i = 1; i < parts.length && current; i++) {
    if (current.children) {
      current = current.children.find(c => c.id === parts[i]);
    } else {
      return null;
    }
  }

  return current;
}

/**
 * 根据路径删除节点
 * @param {Object} config - 配置对象
 * @param {String} path - 节点路径
 */
function deleteNodeByPath(config, path) {
  if (!path) return;

  const parts = path.split('.');

  if (parts.length === 1) {
    // 删除顶层模块
    const index = config.modules.findIndex(m => m.id === parts[0]);
    if (index !== -1) {
      config.modules.splice(index, 1);
    }
  } else {
    // 删除子节点
    const parentPath = parts.slice(0, -1).join('.');
    const parent = findNodeByPath(config, parentPath);

    if (parent && parent.children) {
      const index = parent.children.findIndex(c => c.id === parts[parts.length - 1]);
      if (index !== -1) {
        parent.children.splice(index, 1);
      }
    }
  }
}

// ========== localStorage 课程库管理 ==========

const COURSE_LIBRARY_KEY = 'course-library-v1';

/**
 * 从localStorage加载课程库
 */
function loadCourseLibraryFromLocalStorage() {
  try {
    const saved = localStorage.getItem(COURSE_LIBRARY_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      console.log(`📚 从本地加载课程库: ${data.courses.length} 门课程`);
      return data;
    }
  } catch (error) {
    console.error('加载课程库失败:', error);
  }
  return null;
}

/**
 * 保存课程库到localStorage
 */
function saveCourseLibraryToLocalStorage(courses) {
  try {
    const data = {
      courses: courses,
      savedAt: new Date().toISOString(),
      version: 1
    };
    localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify(data));
    console.log(`💾 课程库已保存: ${courses.length} 门课程`);
  } catch (error) {
    console.error('保存课程库失败:', error);
  }
}

/**
 * 清空课程库
 */
function clearCourseLibraryFromLocalStorage() {
  try {
    localStorage.removeItem(COURSE_LIBRARY_KEY);
    console.log('🗑️ 课程库已清空');
  } catch (error) {
    console.error('清空课程库失败:', error);
  }
}

/**
 * 生成唯一ID
 * @param {Object} config - 配置对象
 * @param {String} prefix - ID前缀,如 "M" 或 "SM"
 * @returns {String} - 唯一ID
 */
function generateUniqueId(config, prefix = 'M') {
  const existingIds = new Set();

  function collectIds(nodes) {
    nodes.forEach(node => {
      if (node.id) existingIds.add(node.id);
      if (node.children) collectIds(node.children);
      if (node.stages) collectIds(node.stages);
    });
  }

  collectIds(config.modules || []);

  let counter = 1;
  let newId;
  do {
    newId = `${prefix}${counter}`;
    counter++;
  } while (existingIds.has(newId));

  return newId;
}

// ========== 层级遍历辅助函数 ==========

/**
 * 递归收集所有课程
 * @param {Object} node - 模块节点
 * @returns {Array} - 课程数组
 */
function collectCourses(node) {
  const courses = [];

  // 收集当前模块的课程
  if (node.courses && Array.isArray(node.courses)) {
    courses.push(...node.courses);
  }

  // 兼容旧格式：stages数组
  if (node.stages && Array.isArray(node.stages)) {
    node.stages.forEach(stage => {
      if (stage.courses && Array.isArray(stage.courses)) {
        courses.push(...stage.courses);
      }
    });
  }

  // 递归收集子模块的课程
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => {
      courses.push(...collectCourses(child));
    });
  }

  return courses;
}

/**
 * 计算模块的年级范围（继承子模块的年级）
 * @param {Object} module - 模块节点
 * @returns {String} - 年级范围字符串
 */
function getModuleGradeRange(module) {
  const courses = collectCourses(module);

  if (courses.length === 0) return '无课程';

  const grades = courses
    .map(c => parseInt(c.grade))
    .filter(g => !isNaN(g))
    .sort((a, b) => a - b);

  if (grades.length === 0) return '未知';

  const min = grades[0];
  const max = grades[grades.length - 1];
  return min === max ? `${min}年级` : `${min}-${max}年级`;
}

/**
 * 检查整个配置中的课程排他性
 * @param {Object} config - 完整配置对象
 * @returns {Object} - {isValid: boolean, duplicates: Array}
 */
function checkCourseExclusivity(config) {
  const courseLocations = new Map(); // courseId -> [locations]

  // 递归收集所有课程及其位置
  function collectCourseLocations(module, modulePath = '') {
    const currentPath = modulePath || module.id || module.name;

    // 收集当前模块的课程
    if (module.courses && Array.isArray(module.courses)) {
      module.courses.forEach(course => {
        if (!courseLocations.has(course.id)) {
          courseLocations.set(course.id, []);
        }
        courseLocations.get(course.id).push({
          path: currentPath,
          moduleName: module.title || module.name || module.id
        });
      });
    }

    // 兼容旧格式: stages
    if (module.stages && Array.isArray(module.stages)) {
      module.stages.forEach(stage => {
        if (stage.courses && Array.isArray(stage.courses)) {
          stage.courses.forEach(course => {
            if (!courseLocations.has(course.id)) {
              courseLocations.set(course.id, []);
            }
            courseLocations.get(course.id).push({
              path: `${currentPath} → ${stage.name}`,
              moduleName: module.title || module.name || module.id,
              stageName: stage.name
            });
          });
        }
      });
    }

    // 递归处理子模块
    if (module.children && Array.isArray(module.children)) {
      module.children.forEach(child => {
        collectCourseLocations(child, `${currentPath}.${child.id || child.name}`);
      });
    }
  }

  // 收集所有课程位置
  if (config && config.modules) {
    config.modules.forEach(module => {
      collectCourseLocations(module);
    });
  }

  // 检查重复
  const duplicates = [];
  courseLocations.forEach((locations, courseId) => {
    if (locations.length > 1) {
      duplicates.push({
        courseId,
        locations,
        count: locations.length
      });
    }
  });

  return {
    isValid: duplicates.length === 0,
    duplicates
  };
}

// 筛选数据（简化版，只筛选模块和年级）
function getFilteredData(config, filters) {
  if (!config) return { data: [], type: 'full' };

  const { module: moduleFilter, grade: gradeFilter } = filters;

  // 无筛选：显示所有模块
  if (moduleFilter === 'all' && gradeFilter === 'all') {
    return { type: 'full', data: config.modules };
  }

  // 仅选领域：显示该模块及其所有子模块和课程
  if (moduleFilter !== 'all' && gradeFilter === 'all') {
    const selectedModule = config.modules.find(m => m.id === moduleFilter);
    return { type: 'module', data: selectedModule ? [selectedModule] : [] };
  }

  // 仅选年级或领域+年级：递归筛选包含该年级课程的模块
  const filterModuleByGrade = (module) => {
    const filteredCourses = (module.courses || []).filter(c => c.grade === gradeFilter);

    // 递归筛选子模块
    let filteredChildren = [];
    if (module.children && Array.isArray(module.children)) {
      filteredChildren = module.children
        .map(child => filterModuleByGrade(child))
        .filter(child => child !== null);
    }

    // 兼容旧格式：stages数组
    let filteredStages = [];
    if (module.stages && Array.isArray(module.stages)) {
      filteredStages = module.stages
        .map(stage => {
          const courses = (stage.courses || []).filter(c => c.grade === gradeFilter);
          return courses.length > 0 ? { ...stage, courses } : null;
        })
        .filter(s => s !== null);
    }

    // 如果当前模块或子模块有符合条件的课程，返回该模块
    if (filteredCourses.length > 0 || filteredChildren.length > 0 || filteredStages.length > 0) {
      return {
        ...module,
        courses: filteredCourses,
        children: filteredChildren,
        ...(filteredStages.length > 0 && { stages: filteredStages })
      };
    }

    return null;
  };

  let filteredModules = config.modules
    .map(m => filterModuleByGrade(m))
    .filter(m => m !== null);

  // 如果选了领域，只返回该领域
  if (moduleFilter !== 'all') {
    filteredModules = filteredModules.filter(m => m.id === moduleFilter);
  }

  return {
    type: moduleFilter !== 'all' ? 'cross' : 'grade',
    data: filteredModules
  };
}

// ========== 主组件 ==========

function AdminApp() {
  const [state, dispatch] = useReducer(configReducer, initialState);

  // 从全局对象中获取拖拽组件 (react-beautiful-dnd 使用 ReactBeautifulDnd 命名空间)
  const { DragDropContext, Droppable, Draggable } = window.ReactBeautifulDnd || {};

  // 初始化时从localStorage加载课程库
  useEffect(() => {
    const savedLibrary = loadCourseLibraryFromLocalStorage();
    if (savedLibrary && savedLibrary.courses.length > 0) {
      dispatch({
        type: 'LOAD_COURSE_LIBRARY',
        payload: {
          courses: savedLibrary.courses,
          fileName: `本地缓存 (${new Date(savedLibrary.savedAt).toLocaleString()})`
        }
      });
    }
  }, []); // 只在挂载时执行一次

  // 加载配置
  useEffect(() => {
    fetch('/api/admin/config')
      .then(res => res.json())
      .then(config => {
        dispatch({ type: 'LOAD_CONFIG', payload: config });
      })
      .catch(error => {
        dispatch({ type: 'LOAD_ERROR', payload: error.message });
      });
  }, []);

  // 获取筛选后的数据
  const filteredData = useMemo(
    () => getFilteredData(state.config, state.filters),
    [state.config, state.filters]
  );

  // 获取可用年级
  const availableGrades = useMemo(() => {
    if (!state.config) return [];
    const grades = new Set();
    state.config.modules.forEach(m => {
      const courses = collectCourses(m);
      courses.forEach(c => grades.add(c.grade));
    });
    return Array.from(grades).sort();
  }, [state.config]);

  // 保存配置
  const handleSave = async () => {
    // 保存前验证课程排他性
    const exclusivityCheck = checkCourseExclusivity(state.config);
    if (!exclusivityCheck.isValid) {
      const duplicateList = exclusivityCheck.duplicates.map(dup => {
        const locations = dup.locations
          .map(loc => `    • ${loc.path}${loc.stageName ? ` (${loc.stageName})` : ''}`)
          .join('\n');
        return `  课程 ${dup.courseId} 在 ${dup.count} 个位置:\n${locations}`;
      }).join('\n\n');

      alert(`❌ 保存失败：发现课程重复\n\n根据排他性规则，同一课程只能存在于一个模块/子模块中。\n\n${duplicateList}\n\n请先删除重复课程后再保存。`);
      return;
    }

    if (!confirm('确定要保存配置吗？此操作会触发验证和同步。')) return;

    dispatch({ type: 'SET_SAVING', value: true });

    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: state.config })
      });

      const result = await response.json();

      if (result.success) {
        dispatch({ type: 'MARK_SAVED' });
        alert('✅ 配置已保存并同步成功！');
      } else {
        dispatch({ type: 'SET_VALIDATION_ERRORS', errors: [result.details || result.error] });
        alert(`❌ 验证失败：\n${result.details || result.error}`);
      }
    } catch (error) {
      alert(`❌ 保存失败：${error.message}`);
    } finally {
      dispatch({ type: 'SET_SAVING', value: false });
    }
  };

  // 处理拖拽结束
  const handleDragEnd = (result) => {
    const { source, destination, type } = result;

    // 调试日志：打印所有拖拽信息
    console.log('🔍 [Drag Debug] 拖拽事件:', {
      type,
      draggableId: result.draggableId,
      source: {
        droppableId: source.droppableId,
        index: source.index
      },
      destination: destination ? {
        droppableId: destination.droppableId,
        index: destination.index
      } : null
    });

    // 没有有效的目标位置
    if (!destination) {
      console.log('🚫 [Drag Debug] 无有效目标，取消拖拽');
      return;
    }

    // 位置没有变化
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      console.log('🚫 [Drag Debug] 位置未变化，取消操作');
      return;
    }

    // 从课程库拖拽到模块
    if (type === 'COURSE' && source.droppableId === 'course-library') {
      // 支持拖拽到 module-{path} 或 module-{path}-stage{index}
      const destMatch = destination.droppableId.match(/^module-(.+?)(?:-stage\d+)?$/);
      if (destMatch) {
        const modulePath = destMatch[1];

        // 🔧 修复: 从 draggableId 中提取课程ID,而不是使用 source.index
        // 因为当课程库被搜索过滤时,source.index 是过滤后数组的索引,
        // 但 state.courseLibrary 是完整的未过滤数组,导致索引不匹配
        const courseId = result.draggableId.replace('library-', '');
        const courseData = state.courseLibrary.find(c => c.id === courseId);

        if (!courseData) {
          console.error(`❌ 找不到课程: ${courseId}`);
          alert(`找不到课程 ${courseId}，请刷新页面后重试`);
          return;
        }

        console.log('🎯 从课程库拖拽课程:', {
          courseId: courseData.id,
          courseTitle: courseData.title,
          targetModule: modulePath
        });

        dispatch({
          type: 'ADD_COURSE_FROM_LIBRARY',
          payload: {
            modulePath: modulePath,
            courseData: courseData
          }
        });
      }
      return;
    }

    // 课程在同一模块内拖拽排序或跨模块移动
    if (type === 'COURSE') {
      // 提取模块路径，忽略stage后缀
      const sourceMatch = source.droppableId.match(/^module-(.+?)(?:-stage\d+)?$/);
      const destMatch = destination.droppableId.match(/^module-(.+?)(?:-stage\d+)?$/);

      if (sourceMatch && destMatch) {
        if (sourceMatch[1] === destMatch[1]) {
          // 同一模块内排序
          dispatch({
            type: 'REORDER_COURSES',
            payload: {
              modulePath: sourceMatch[1],
              sourceIndex: source.index,
              destinationIndex: destination.index
            }
          });
        } else {
          // 跨模块移动课程
          const sourceModulePath = sourceMatch[1];
          const destModulePath = destMatch[1];

          // 从 draggableId 提取课程ID
          const courseId = result.draggableId.replace(/^course-.+-/, '');

          console.log('🔄 跨模块移动课程:', {
            courseId,
            from: sourceModulePath,
            to: destModulePath,
            sourceIndex: source.index
          });

          dispatch({
            type: 'MOVE_COURSE_BETWEEN_MODULES',
            payload: {
              sourceModulePath,
              destModulePath,
              courseIndex: source.index,
              courseId
            }
          });
        }
      }
    } else if (type === 'SUBMODULE') {
      // 子模块拖拽: 支持同一父模块内排序和跨Module移动
      const sourceMatch = source.droppableId.match(/^parent-(.+)$/);
      const destMatch = destination.droppableId.match(/^parent-(.+)$/);

      console.log('🔍 [Drag Debug] 子模块拖拽匹配:', {
        sourceMatch: sourceMatch ? sourceMatch[0] : null,
        destMatch: destMatch ? destMatch[0] : null,
        sourceParentPath: sourceMatch ? sourceMatch[1] : null,
        destParentPath: destMatch ? destMatch[1] : null
      });

      if (sourceMatch && destMatch) {
        const sourceParentPath = sourceMatch[1];
        const destParentPath = destMatch[1];

        // 从 draggableId 提取子模块ID (draggableId格式: submodule-{parentPath}-{childId})
        // 使用 lastIndexOf 提取最后一个 '-' 之后的部分作为子模块ID
        const stageId = result.draggableId.substring(result.draggableId.lastIndexOf('-') + 1);

        console.log('🔍 [Drag Debug] 提取的子模块ID:', stageId);

        if (sourceParentPath === destParentPath) {
          // 同一父模块内排序
          console.log('↕️ [Drag Debug] 同一父模块内排序');
          dispatch({
            type: 'REORDER_SUBMODULES',
            payload: {
              parentPath: sourceParentPath,
              sourceIndex: source.index,
              destinationIndex: destination.index
            }
          });
        } else {
          // 跨Module移动子模块
          console.log('🔄 [Drag Debug] 跨Module移动子模块:', {
            stageId,
            from: sourceParentPath,
            to: destParentPath,
            sourceIndex: source.index,
            destinationIndex: destination.index
          });

          dispatch({
            type: 'MOVE_STAGE_BETWEEN_MODULES',
            payload: {
              sourceParentPath,
              destParentPath,
              stageIndex: source.index,
              destinationIndex: destination.index,
              stageId
            }
          });
        }
      } else {
        console.log('🚫 [Drag Debug] 父模块路径匹配失败');
      }
    } else if (type === 'TOP_MODULE') {
      // 顶层模块拖拽排序
      if (source.droppableId === 'top-modules' && destination.droppableId === 'top-modules') {
        dispatch({
          type: 'REORDER_TOP_MODULES',
          payload: {
            sourceIndex: source.index,
            destinationIndex: destination.index
          }
        });
      }
    }
  };

  // 处理文件导入(支持多文件)
  const handleFileImport = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // 检查文件格式
    const invalidFiles = files.filter(f => !f.name.endsWith('.ipynb'));
    if (invalidFiles.length > 0) {
      alert(`请选择.ipynb格式的Jupyter Notebook文件\n无效文件: ${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    try {
      let allCourses = [...state.courseLibrary]; // 保留已有课程
      const fileNames = [];
      const courseIdSet = new Set(allCourses.map(c => c.id)); // 用于去重

      // 依次处理每个文件
      for (const file of files) {
        try {
          // 使用FileReader读取文件
          const fileContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error(`文件 ${file.name} 读取失败`));
            reader.readAsText(file);
          });

          // 解析JSON
          const notebook = JSON.parse(fileContent);
          const cells = notebook.cells || [];

          // 提取课程
          const courses = extractCoursesFromCells(cells);

          // 去重:只添加ID不重复的课程
          const newCourses = courses.filter(c => {
            if (courseIdSet.has(c.id)) {
              console.warn(`课程 ${c.id} 已存在,跳过`);
              return false;
            }
            courseIdSet.add(c.id);
            return true;
          });

          allCourses.push(...newCourses);
          fileNames.push(file.name);
        } catch (error) {
          console.error(`处理文件 ${file.name} 失败:`, error);
          // 继续处理下一个文件
        }
      }

      if (allCourses.length === state.courseLibrary.length) {
        alert('未能识别到新课程，请检查文件格式');
        return;
      }

      // 保存到课程库(同时更新localStorage)
      dispatch({
        type: 'LOAD_COURSE_LIBRARY',
        payload: {
          courses: allCourses,
          fileName: fileNames.length > 1
            ? `${fileNames.length}个文件 (最新: ${fileNames[fileNames.length - 1]})`
            : fileNames[0]
        }
      });

      // 持久化到localStorage
      saveCourseLibraryToLocalStorage(allCourses);

      const newCount = allCourses.length - state.courseLibrary.length;
      alert(`✅ 成功导入 ${files.length} 个文件\n新增课程: ${newCount} 门\n课程库总数: ${allCourses.length} 门`);
    } catch (error) {
      alert(`❌ 导入失败：${error.message}`);
      console.error('导入notebook失败:', error);
    }

    // 重置input值，允许重新选择相同文件
    event.target.value = '';
  };

  // 从cells中提取课程信息
  const extractCoursesFromCells = (cells) => {
    const courses = [];
    // 修改正则：支持所有前缀 (A, U, G, Z, Q, S, L, P等)
    // 使用通用模式: [A-Z]+\d* 匹配任意前缀组合
    // 支持有冒号(: 或 ：)或无冒号(只用空格)的格式
    const coursePattern = /^#{1,6}\s*\*{0,2}\s*(?:M\d+\s+)?\*{0,2}\s*((?:[A-Z]+\d*)-\d+[A-Z]?)\*{0,2}(?:\s*[:\uff1a]|\s)\s*(.+?)(?:\*{0,2})$/m;

    cells.forEach((cell, index) => {
      if (cell.cell_type !== 'markdown') return;

      const content = Array.isArray(cell.source)
        ? cell.source.join('')
        : cell.source;

      const match = content.match(coursePattern);
      if (match) {
        const courseId = match[1].trim();
        const title = match[2].trim().replace(/\*+/g, '');

        // 提取年级信息 - 支持所有前缀
        let grade = '';
        const gradeMatch = courseId.match(/[A-Z]+(\d+)-/);
        if (gradeMatch) {
          grade = gradeMatch[1];
        } else if (courseId.startsWith('P-')) {
          grade = '预备';
        }

        // 尝试提取描述
        let desc = '';
        if (index + 1 < cells.length && cells[index + 1].cell_type === 'markdown') {
          const nextContent = Array.isArray(cells[index + 1].source)
            ? cells[index + 1].source.join('')
            : cells[index + 1].source;

          const lines = nextContent.split('\n').filter(line =>
            line.trim() && !line.trim().startsWith('#')
          );
          if (lines.length > 0) {
            desc = lines[0].trim().substring(0, 100);
          }
        }

        courses.push({
          id: courseId,
          title: title,
          desc: desc || `${title}的详细内容`,
          grade: grade,
          url: `html/${courseId}.html`
        });
      }
    });

    return courses;
  };

  // 离开页面提示
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (state.isDirty) {
        e.preventDefault();
        e.returnValue = '有未保存的修改，确定离开？';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.isDirty]);

  if (state.loading) {
    return <div className="loading">加载配置中...</div>;
  }

  if (state.error) {
    return <div className="error">加载失败：{state.error}</div>;
  }

  // 如果 DnD 库未加载，降级显示
  if (!DragDropContext) {
    return (
      <div className="admin-app">
        <div className="error">拖拽库加载失败，请刷新页面</div>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="admin-app">
        {/* 顶部工具栏 */}
        <header className="admin-header">
          <h1>🎨 课程配置管理</h1>
          <div className="header-actions">
            <button
              className="btn-new-module"
              onClick={() => dispatch({
                type: 'OPEN_MODULE_EDITOR',
                payload: { node: null, path: null }
              })}
              title="创建顶层模块"
            >
              ➕ 新建模块
            </button>
            <button
              className="btn-save"
              onClick={handleSave}
              disabled={!state.isDirty || state.isSaving}
            >
              {state.isSaving ? '保存中...' : state.isDirty ? '💾 保存配置 *' : '💾 保存配置'}
            </button>
            <a href="/roadmap2_original.html" className="btn-preview">
              👁️ 预览主应用
            </a>
          </div>
        </header>

        {/* 筛选器 */}
        <div className="filter-panel">
          <label>
            知识领域:
            <select
              value={state.filters.module}
              onChange={(e) => dispatch({ type: 'SET_FILTER', field: 'module', value: e.target.value })}
            >
              <option value="all">全部</option>
              {state.config.modules.map(m => (
                <option key={m.id} value={m.id}>{m.title || m.name || m.id}</option>
              ))}
            </select>
          </label>

          <label>
            年级:
            <select
              value={state.filters.grade}
              onChange={(e) => dispatch({ type: 'SET_FILTER', field: 'grade', value: e.target.value })}
            >
              <option value="all">全部</option>
              {availableGrades.map(g => (
                <option key={g} value={g}>{g}年级</option>
              ))}
            </select>
          </label>

          {(state.filters.module !== 'all' || state.filters.grade !== 'all') && (
            <button
              className="btn-reset-filter"
              onClick={() => dispatch({ type: 'RESET_FILTERS' })}
            >
              清除筛选
            </button>
          )}

          <div className="course-library-actions">
            <label className="btn-import-file">
              📁 导入Notebook
              <input
                type="file"
                accept=".ipynb"
                multiple
                onChange={handleFileImport}
                style={{ display: 'none' }}
              />
            </label>
            {state.courseLibrary.length > 0 && (
              <>
                <button
                  className="btn-toggle-library"
                  onClick={() => dispatch({ type: 'TOGGLE_COURSE_LIBRARY' })}
                >
                  {state.showCourseLibrary ? '隐藏' : '显示'}课程库 ({state.courseLibrary.length})
                </button>
                <button
                  className="btn-clear-library"
                  onClick={() => {
                    if (confirm(`确定清空课程库吗？\n当前有 ${state.courseLibrary.length} 门课程`)) {
                      clearCourseLibraryFromLocalStorage();
                      dispatch({
                        type: 'LOAD_COURSE_LIBRARY',
                        payload: { courses: [], fileName: null }
                      });
                    }
                  }}
                  title="清空课程库"
                >
                  🗑️ 清空
                </button>
              </>
            )}
          </div>
        </div>

        {/* 课程库面板 */}
        {state.showCourseLibrary && state.courseLibrary.length > 0 && (
          <CourseLibraryPanel
            courses={state.courseLibrary}
            fileName={state.libraryFileName}
            config={state.config}
            Droppable={Droppable}
            Draggable={Draggable}
            onClose={() => dispatch({ type: 'TOGGLE_COURSE_LIBRARY' })}
          />
        )}

        {/* 主内容区 */}
        <main className={`admin-main ${state.showCourseLibrary ? 'with-library' : ''}`}>
          {filteredData.data.length === 0 ? (
            <div className="empty-state">无符合条件的课程</div>
          ) : (
            <Droppable droppableId="top-modules" type="TOP_MODULE">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {filteredData.data.map((module, index) => (
                    <Draggable
                      key={module.id}
                      draggableId={`top-module-${module.id}`}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={snapshot.isDragging ? 'is-dragging' : ''}
                        >
                          <ModuleSection
                            module={module}
                            modulePath={module.id}
                            expandedModules={state.expandedModules}
                            dispatch={dispatch}
                            Droppable={Droppable}
                            Draggable={Draggable}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}
        </main>

        {/* 课程编辑弹窗 */}
        {state.showEditModal && (
          <CourseEditModal
            course={state.editingCourse}
            onSave={(courseData) => {
              const { modulePath, courseIndex } = state.editingCourse;
              dispatch({
                type: 'UPDATE_COURSE',
                payload: { modulePath, courseIndex, courseData }
              });
            }}
            onClose={() => dispatch({ type: 'CLOSE_EDIT_MODAL' })}
          />
        )}

        {/* 模块编辑弹窗 */}
        {state.showModuleEditor && (
          <ModuleEditor
            node={state.editingNode}
            path={state.editingNodePath}
            config={state.config}
            onSave={(moduleData) => {
              if (state.editingNode) {
                // 编辑现有模块
                dispatch({
                  type: 'UPDATE_MODULE',
                  payload: { path: state.editingNodePath, moduleData }
                });
              } else {
                // 新建模块
                dispatch({
                  type: 'ADD_MODULE',
                  payload: { parentPath: state.editingNodePath, moduleData }
                });
              }
            }}
            onClose={() => dispatch({ type: 'CLOSE_MODULE_EDITOR' })}
          />
        )}

      </div>
    </DragDropContext>
  );
}

// ========== 子组件 ==========

function ModuleSection({ module, modulePath, expandedModules, dispatch, Droppable, Draggable }) {
  // 拖拽悬停自动展开的定时器状态
  const [dragOverTimer, setDragOverTimer] = useState(null);

  // 兼容新旧字段名: title/name, desc/description
  const moduleTitle = module.title || module.name || '未命名模块';
  const moduleDesc = module.desc || module.description || '';

  // 计算当前模块的完整路径和ID
  const currentPath = modulePath || module.id;
  const moduleId = currentPath;  // 用于展开状态判断
  const isExpanded = expandedModules.has(moduleId);

  // 计算年级范围（继承子模块的年级）
  const gradeRange = getModuleGradeRange(module);
  const courseCount = collectCourses(module).length;

  // 拖拽悬停处理:折叠的模块悬停800ms后自动展开
  const handleDragOver = (e) => {
    // 只处理折叠状态且有子模块的情况
    if (!isExpanded && module.children && module.children.length > 0) {
      e.preventDefault(); // 允许放置
      if (!dragOverTimer) {
        const timer = setTimeout(() => {
          console.log(`🔓 自动展开模块: ${moduleId}`);
          dispatch({ type: 'TOGGLE_MODULE', moduleId });
          setDragOverTimer(null);
        }, 800);
        setDragOverTimer(timer);
      }
    }
  };

  // 拖拽离开处理:取消待执行的自动展开
  const handleDragLeave = (e) => {
    if (dragOverTimer) {
      clearTimeout(dragOverTimer);
      setDragOverTimer(null);
      console.log(`⏹️ 取消自动展开: ${moduleId}`);
    }
  };

  return (
    <section className="module-section">
      <div
        className="module-header-wrapper"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <h2 className="module-title" style={{ borderLeftColor: getModuleColor(module.id) }}>
          {module.icon && <span className="module-icon">{module.icon}</span>}
          <span
            className="module-toggle"
            onClick={() => dispatch({ type: 'TOGGLE_MODULE', moduleId })}
            style={{ cursor: 'pointer', marginRight: '8px' }}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
          {moduleTitle}
          <span className="module-desc">{moduleDesc}</span>
          <span className="grade-badge" style={{ marginLeft: '8px' }}>{gradeRange}</span>
          <span className="course-count">({courseCount}门)</span>
        </h2>
        <div className="module-actions">
          <button
            className="btn-sm btn-add-submodule"
            onClick={() => dispatch({
              type: 'OPEN_MODULE_EDITOR',
              payload: { node: null, path: currentPath }
            })}
            title="在此模块下创建子模块"
          >
            ➕ 子模块
          </button>
          <button
            className="btn-sm btn-edit-module"
            onClick={() => dispatch({
              type: 'OPEN_MODULE_EDITOR',
              payload: { node: module, path: currentPath }
            })}
            title="编辑模块"
          >
            ✏️ 编辑
          </button>
          <button
            className="btn-sm btn-delete-module"
            onClick={() => {
              if (confirm(`确定删除模块 "${moduleTitle}" 及其所有内容吗？`)) {
                dispatch({
                  type: 'DELETE_MODULE',
                  payload: { path: currentPath }
                });
              }
            }}
            title="删除模块"
          >
            🗑️ 删除
          </button>
        </div>
      </div>

      {/* 展开后渲染子模块和课程 */}
      {isExpanded && (
        <div className="module-children">
          {/* 渲染子模块（支持拖拽排序） */}
          {module.children && module.children.length > 0 && (
            <Droppable droppableId={`parent-${currentPath}`} type="SUBMODULE">
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className={`submodules-container ${snapshot.isDraggingOver ? 'is-dragging-over' : ''}`}>
                  {module.children.map((child, index) => (
                    <Draggable
                      key={child.id}
                      draggableId={`submodule-${currentPath}-${child.id}`}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={snapshot.isDragging ? 'is-dragging' : ''}
                        >
                          <ModuleSection
                            module={child}
                            modulePath={`${currentPath}.${child.id}`}
                            expandedModules={expandedModules}
                            dispatch={dispatch}
                            Droppable={Droppable}
                            Draggable={Draggable}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}

          {/* 渲染旧格式的stages（保持分组结构） */}
          {module.stages && module.stages.map((stage, stageIndex) => (
            <div key={`stage-${stageIndex}`} className="stage-group">
              <h3 className="stage-title">
                📚 {stage.name}
                <span className="stage-course-count">({stage.courses?.length || 0}门)</span>
              </h3>
              <Droppable droppableId={`module-${currentPath}-stage${stageIndex}`} type="COURSE">
                {(provided, snapshot) => (
                  <div
                    className={`course-list ${snapshot.isDraggingOver ? 'is-dragging-over' : ''}`}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {stage.courses && stage.courses.map((course, courseIndex) => {
                      // 计算全局索引（考虑前面所有stages的课程）
                      let globalIndex = (module.courses?.length || 0);
                      for (let i = 0; i < stageIndex; i++) {
                        globalIndex += (module.stages[i].courses?.length || 0);
                      }
                      globalIndex += courseIndex;

                      return (
                        <Draggable
                          key={course.id}
                          draggableId={`course-${currentPath}-${course.id}`}
                          index={globalIndex}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <CourseCard
                                course={course}
                                isDragging={snapshot.isDragging}
                                onEdit={() => dispatch({
                                  type: 'OPEN_EDIT_MODAL',
                                  course: { ...course, modulePath: currentPath, courseIndex: globalIndex }
                                })}
                                onDelete={() => {
                                  if (confirm(`确定删除课程 "${course.title}" 吗？`)) {
                                    dispatch({
                                      type: 'DELETE_COURSE',
                                      payload: { modulePath: currentPath, courseIndex: globalIndex }
                                    });
                                  }
                                }}
                              />
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}

          {/* 渲染新格式的courses（直接挂在模块下），或为没有courses的模块提供可拖拽区域 */}
          {!module.stages && (
            <Droppable droppableId={`module-${currentPath}`} type="COURSE">
              {(provided, snapshot) => (
                <div
                  className={`course-list ${snapshot.isDraggingOver ? 'is-dragging-over' : ''}`}
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  {module.courses && module.courses.map((course, courseIndex) => (
                    <Draggable
                      key={course.id}
                      draggableId={`course-${currentPath}-${course.id}`}
                      index={courseIndex}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          <CourseCard
                            course={course}
                            isDragging={snapshot.isDragging}
                            onEdit={() => dispatch({
                              type: 'OPEN_EDIT_MODAL',
                              course: { ...course, modulePath: currentPath, courseIndex }
                            })}
                            onDelete={() => {
                              if (confirm(`确定删除课程 "${course.title}" 吗？`)) {
                                dispatch({
                                  type: 'DELETE_COURSE',
                                  payload: { modulePath: currentPath, courseIndex }
                                });
                              }
                            }}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}

          {/* 新建课程按钮（总是显示） */}
          <button
            className="btn-add-course"
            onClick={() => {
              // 计算新课程的索引：所有现有课程之后
              let totalCourses = (module.courses?.length || 0);
              if (module.stages) {
                module.stages.forEach(stage => {
                  totalCourses += (stage.courses?.length || 0);
                });
              }
              dispatch({
                type: 'OPEN_EDIT_MODAL',
                course: { modulePath: currentPath, courseIndex: -1 }
              });
            }}
          >
            + 新建课程
          </button>
        </div>
      )}
    </section>
  );
}


function CourseCard({ course, onEdit, onDelete, isDragging }) {
  return (
    <div className={`course-card ${isDragging ? 'is-dragging' : ''}`}>
      <div className="course-header">
        <span className="course-id">{course.id}</span>
        <span className="course-grade-badge">{course.grade}年级</span>
      </div>
      <h4 className="course-title">{course.title}</h4>
      <p className="course-desc">{course.desc}</p>
      <div className="course-actions">
        <button className="btn-edit" onClick={onEdit}>编辑</button>
        <button className="btn-delete" onClick={onDelete}>删除</button>
      </div>
    </div>
  );
}

function CourseEditModal({ course, onSave, onClose }) {
  const isEdit = course && course.id;
  const [formData, setFormData] = useState({
    id: course?.id || '',
    title: course?.title || '',
    desc: course?.desc || '',
    grade: course?.grade || '2',
    url: course?.url || ''
  });
  const [errors, setErrors] = useState({});

  // 字段验证
  const validateField = (field, value) => {
    switch (field) {
      case 'id':
        if (!/^(L\d+-\d+|P-\d+|S-\d+)$/.test(value)) {
          return 'ID格式错误（正确格式：L2-01、P-1、S-1）';
        }
        break;
      case 'title':
        if (!value || value.trim().length < 2) {
          return '标题至少2个字符';
        }
        break;
      case 'desc':
        if (!value || value.trim().length < 2) {
          return '描述至少2个字符';
        }
        break;
      case 'url':
        if (!value || value === 'html/.html') {
          return 'URL不能为空';
        }
        break;
    }
    return null;
  };

  // 字段修改
  const handleFieldChange = (field, value) => {
    const error = validateField(field, value);
    setErrors({ ...errors, [field]: error });

    let newData = { ...formData, [field]: value };

    // 自动填充URL
    if (field === 'id' && !error) {
      newData.url = `html/${value}.html`;
    }

    setFormData(newData);
  };

  // 提交
  const handleSubmit = () => {
    // 验证所有字段
    const allErrors = {};
    for (const field in formData) {
      const error = validateField(field, formData[field]);
      if (error) allErrors[field] = error;
    }

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      alert('请修正表单错误');
      return;
    }

    // 调用保存回调
    onSave(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? '编辑课程' : '新建课程'}</h2>

        <div className="form-group">
          <label>
            课程ID *
            {!isEdit && <span className="hint">（格式：L2-01、P-1 等）</span>}
          </label>
          <input
            type="text"
            value={formData.id}
            onChange={(e) => handleFieldChange('id', e.target.value)}
            placeholder="L2-01 或 P-1"
            disabled={isEdit}
            className={errors.id ? 'error' : ''}
          />
          {errors.id && <span className="error-msg">{errors.id}</span>}
        </div>

        <div className="form-group">
          <label>标题 *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            placeholder="课程标题"
            className={errors.title ? 'error' : ''}
          />
          {errors.title && <span className="error-msg">{errors.title}</span>}
        </div>

        <div className="form-group">
          <label>描述 *</label>
          <textarea
            value={formData.desc}
            onChange={(e) => handleFieldChange('desc', e.target.value)}
            placeholder="课程描述"
            rows={3}
            className={errors.desc ? 'error' : ''}
          />
          {errors.desc && <span className="error-msg">{errors.desc}</span>}
        </div>

        <div className="form-group">
          <label>年级 *</label>
          <select
            value={formData.grade}
            onChange={(e) => handleFieldChange('grade', e.target.value)}
            className={errors.grade ? 'error' : ''}
          >
            <option value="2">2年级</option>
            <option value="3">3年级</option>
            <option value="4">4年级</option>
            <option value="5">5年级</option>
            <option value="6">6年级</option>
          </select>
          {errors.grade && <span className="error-msg">{errors.grade}</span>}
        </div>

        <div className="form-group">
          <label>
            URL *
            <span className="hint">（通常自动填充）</span>
          </label>
          <input
            type="text"
            value={formData.url}
            onChange={(e) => handleFieldChange('url', e.target.value)}
            placeholder="html/L2-01.html"
            className={errors.url ? 'error' : ''}
          />
          {errors.url && <span className="error-msg">{errors.url}</span>}
        </div>

        <div className="modal-actions">
          <button onClick={handleSubmit} className="btn-primary">
            {isEdit ? '保存修改' : '创建课程'}
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

// ========== ModuleEditor 组件 ==========
function ModuleEditor({ node, path, config, onSave, onClose }) {
  const isEdit = !!node;

  // 自动生成ID:根据层级推断前缀
  const generateAutoId = () => {
    if (isEdit) return node.id;

    // 根据path计算层级
    const level = path ? path.split('.').length : 0;

    // 生成前缀: 顶层=M, 第一层子模块=SM, 第二层=SSM, 依此类推
    let prefix;
    if (level === 0) {
      prefix = 'M';  // 顶层模块
    } else if (level === 1) {
      prefix = 'SM'; // 子模块
    } else if (level === 2) {
      prefix = 'SSM'; // 孙模块
    } else {
      prefix = 'S'.repeat(level) + 'M'; // 更深层级
    }

    return generateUniqueId(config, prefix);
  };

  const [formData, setFormData] = useState({
    id: generateAutoId(),
    name: node?.name || '',
    description: node?.description || ''
  });
  const [errors, setErrors] = useState({});

  // 字段验证(ID自动生成,无需验证)
  const validateField = (field, value) => {
    switch (field) {
      case 'name':
        if (!value || value.trim().length < 2) {
          return '名称至少2个字符';
        }
        break;
      case 'description':
        if (!value || value.trim().length < 2) {
          return '描述至少2个字符';
        }
        break;
    }
    return null;
  };

  // 字段修改
  const handleFieldChange = (field, value) => {
    const error = validateField(field, value);
    setErrors({ ...errors, [field]: error });
    setFormData({ ...formData, [field]: value });
  };

  // 提交
  const handleSubmit = () => {
    // 验证名称和描述
    const allErrors = {};
    ['name', 'description'].forEach(field => {
      const error = validateField(field, formData[field]);
      if (error) allErrors[field] = error;
    });

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      alert('请修正表单错误');
      return;
    }

    onSave(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content module-editor-modal">
        <div className="modal-header">
          <h3>{isEdit ? '编辑模块' : '新建模块'}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>
            模块ID
            <span className="hint">（自动生成）</span>
          </label>
          <input
            type="text"
            value={formData.id}
            className="readonly-field"
            disabled
            readOnly
          />
        </div>

        <div className="form-group">
          <label>模块名称 *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            placeholder="如: 数与代数"
            className={errors.name ? 'error' : ''}
          />
          {errors.name && <span className="error-msg">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label>模块描述 *</label>
          <textarea
            value={formData.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            placeholder="简要描述模块内容"
            rows="3"
            className={errors.description ? 'error' : ''}
          />
          {errors.description && <span className="error-msg">{errors.description}</span>}
        </div>

        {path && (
          <div className="form-info">
            <strong>父级路径:</strong> {path || '顶层'}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={handleSubmit} className="btn-primary">
            {isEdit ? '保存修改' : '创建模块'}
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

// 工具函数：模块颜色
function getModuleColor(moduleId) {
  const colors = {
    M1: '#3b82f6',
    M2: '#8b5cf6',
    M3: '#ec4899',
    M4: '#f59e0b',
    M5: '#10b981',
    M6: '#06b6d4',
    M7: '#ef4444',
    M8: '#6366f1'
  };
  return colors[moduleId] || '#6b7280';
}

// ========== 课程配置信息收集工具 ==========

/**
 * 收集所有已配置课程的位置信息
 * @param {Object} config - 配置对象
 * @returns {Map} courseId -> 位置信息数组
 */
function collectConfiguredCoursePaths(config) {
  const coursePathsMap = new Map();

  if (!config || !config.modules) return coursePathsMap;

  function traverseModule(mod, parentPath = []) {
    const moduleName = mod.title || mod.name || mod.id;
    const currentPath = [...parentPath, moduleName];

    // 收集直接在模块下的课程
    if (mod.courses && Array.isArray(mod.courses)) {
      mod.courses.forEach(course => {
        if (!coursePathsMap.has(course.id)) {
          coursePathsMap.set(course.id, []);
        }
        coursePathsMap.get(course.id).push({
          path: currentPath.join(' → '),
          pathArray: currentPath,
          moduleName: moduleName
        });
      });
    }

    // 收集stages中的课程（兼容旧格式）
    if (mod.stages && Array.isArray(mod.stages)) {
      mod.stages.forEach(stage => {
        const stageName = stage.name;
        const stagePath = [...currentPath, stageName];

        if (stage.courses && Array.isArray(stage.courses)) {
          stage.courses.forEach(course => {
            if (!coursePathsMap.has(course.id)) {
              coursePathsMap.set(course.id, []);
            }
            coursePathsMap.get(course.id).push({
              path: stagePath.join(' → '),
              pathArray: stagePath,
              moduleName: moduleName,
              stageName: stageName
            });
          });
        }
      });
    }

    // 递归遍历子模块
    if (mod.children && Array.isArray(mod.children)) {
      mod.children.forEach(child => traverseModule(child, currentPath));
    }
  }

  // 遍历所有顶层模块
  config.modules.forEach(module => traverseModule(module));

  return coursePathsMap;
}

// ========== 课程库组件 ==========

function CourseLibraryPanel({ courses, fileName, Droppable, Draggable, onClose, config }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfiguredCourses, setShowConfiguredCourses] = useState(false);

  // 收集所有已配置课程的路径信息
  const configuredCoursePaths = useMemo(() => {
    return config ? collectConfiguredCoursePaths(config) : new Map();
  }, [config]);

  // 筛选课程
  const filteredCourses = useMemo(() => {
    let result = courses;

    // 1. 过滤掉已配置的课程（除非用户选择显示）
    if (!showConfiguredCourses) {
      result = result.filter(course => !configuredCoursePaths.has(course.id));
    }

    // 2. 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.id.toLowerCase().includes(term) ||
        c.title.toLowerCase().includes(term) ||
        c.desc.toLowerCase().includes(term)
      );
    }

    return result;
  }, [courses, searchTerm, showConfiguredCourses, configuredCoursePaths]);

  // 统计信息
  const stats = useMemo(() => {
    const total = courses.length;
    const configured = courses.filter(c => configuredCoursePaths.has(c.id)).length;
    const available = total - configured;
    return { total, configured, available };
  }, [courses, configuredCoursePaths]);

  return (
    <div className="course-library-panel">
      <div className="library-header">
        <h3>📚 课程库</h3>
        <span className="library-file-name">{fileName}</span>
        <button className="btn-close" onClick={onClose}>✕</button>
      </div>

      {/* 统计信息 */}
      <div className="library-stats">
        <div className="stat-item stat-available">
          <span className="stat-label">可用</span>
          <span className="stat-value">{stats.available}</span>
        </div>
        <div className="stat-item stat-configured">
          <span className="stat-label">已配置</span>
          <span className="stat-value">{stats.configured}</span>
        </div>
        <div className="stat-item stat-total">
          <span className="stat-label">总数</span>
          <span className="stat-value">{stats.total}</span>
        </div>
      </div>

      <div className="library-search">
        <input
          type="text"
          placeholder="搜索课程ID、标题或描述..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <span className="search-count">
          {filteredCourses.length} 门课程
        </span>
      </div>

      {/* 显示已配置课程切换按钮 */}
      <div className="library-controls">
        <label className="toggle-configured-label">
          <input
            type="checkbox"
            checked={showConfiguredCourses}
            onChange={(e) => setShowConfiguredCourses(e.target.checked)}
          />
          <span>显示已配置课程</span>
        </label>
        <div className="library-hint">
          💡 拖拽课程到右侧框架中
        </div>
      </div>

      <Droppable droppableId="course-library" type="COURSE" isDropDisabled={true}>
        {(provided, snapshot) => (
          <div
            className="library-course-list"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {filteredCourses.length === 0 ? (
              <div className="empty-state">无匹配课程</div>
            ) : (
              filteredCourses.map((course, index) => {
                // 检查课程是否已配置
                const isConfigured = configuredCoursePaths.has(course.id);
                const coursePaths = isConfigured ? configuredCoursePaths.get(course.id) : [];

                return (
                  <Draggable
                    key={course.id}
                    draggableId={`library-${course.id}`}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`library-course-item ${snapshot.isDragging ? 'is-dragging' : ''} ${isConfigured ? 'is-configured' : ''}`}
                      >
                        <div className="library-course-header">
                          <span className="course-id">{course.id}</span>
                          {isConfigured && <span className="configured-badge">✓ 已配置</span>}
                          {!isConfigured && course.grade && course.grade !== '预备' && course.grade !== '综合' && (
                            <span className="grade-badge">{course.grade}年级</span>
                          )}
                          {!isConfigured && course.grade === '预备' && <span className="grade-badge-prep">预备</span>}
                          {!isConfigured && course.grade === '综合' && <span className="grade-badge-general">综合</span>}
                        </div>
                        <div className="library-course-title">{course.title}</div>
                        <div className="library-course-desc">{course.desc}</div>

                        {/* 显示课程配置路径 */}
                        {isConfigured && coursePaths.length > 0 && (
                          <div className="course-config-paths">
                            {coursePaths.map((pathInfo, idx) => (
                              <div key={idx} className="config-path-item">
                                <span className="path-icon">📍</span>
                                <span className="path-text">{pathInfo.path}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

