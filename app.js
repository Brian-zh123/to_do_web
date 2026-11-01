(function () {
  'use strict';

  const parser = window.CampusParser;
  if (!parser) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">解析器加载失败，请刷新页面。</p>';
    return;
  }

  const STORAGE = {
    draft: 'campus-concierge.draft.v1',
    current: 'campus-concierge.current.v1',
    history: 'campus-concierge.history.v1',
  };

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const CATEGORY_ICONS = {
    activity: 'megaphone',
    award: 'spark',
    exam: 'book',
    pickup: 'pin',
    payment: 'calendar',
    career: 'book',
    admin: 'list',
    general: 'list',
  };

  const el = {
    todayWeekday: document.getElementById('todayWeekday'),
    todayDate: document.getElementById('todayDate'),
    noticeInput: document.getElementById('noticeInput'),
    charCount: document.getElementById('charCount'),
    sampleChips: document.getElementById('sampleChips'),
    parseButton: document.getElementById('parseButton'),
    clearButton: document.getElementById('clearButton'),
    emptySampleButton: document.getElementById('emptySampleButton'),
    emptyState: document.getElementById('emptyState'),
    resultContent: document.getElementById('resultContent'),
    coverageBadge: document.getElementById('coverageBadge'),
    categoryChip: document.getElementById('categoryChip'),
    resultTitle: document.getElementById('resultTitle'),
    resultSummary: document.getElementById('resultSummary'),
    whatValue: document.getElementById('whatValue'),
    whatSub: document.getElementById('whatSub'),
    whenLabel: document.getElementById('whenLabel'),
    whenValue: document.getElementById('whenValue'),
    whenSub: document.getElementById('whenSub'),
    todoValue: document.getElementById('todoValue'),
    todoSub: document.getElementById('todoSub'),
    whereValue: document.getElementById('whereValue'),
    whereSub: document.getElementById('whereSub'),
    eventStrip: document.getElementById('eventStrip'),
    eventStripText: document.getElementById('eventStripText'),
    taskCountLabel: document.getElementById('taskCountLabel'),
    progressText: document.getElementById('progressText'),
    progressBar: document.getElementById('progressBar'),
    taskList: document.getElementById('taskList'),
    addTaskForm: document.getElementById('addTaskForm'),
    addTaskInput: document.getElementById('addTaskInput'),
    copyButton: document.getElementById('copyButton'),
    icsButton: document.getElementById('icsButton'),
    sourceDetails: document.getElementById('sourceDetails'),
    sourceText: document.getElementById('sourceText'),
    historyToggle: document.getElementById('historyToggle'),
    historyCount: document.getElementById('historyCount'),
    historyDrawer: document.getElementById('historyDrawer'),
    historyClose: document.getElementById('historyClose'),
    historyList: document.getElementById('historyList'),
    historyBackdrop: document.getElementById('drawerBackdrop'),
    clearHistoryButton: document.getElementById('clearHistoryButton'),
    miniHistory: document.getElementById('miniHistory'),
    miniHistoryList: document.getElementById('miniHistoryList'),
    openHistoryFromMini: document.getElementById('openHistoryFromMini'),
    toast: document.getElementById('toast'),
  };

  let current = null;
  let history = [];
  let toastTimer = null;
  let loadingTimer = null;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function dateOffsetLabel(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
  }

  const samples = [
    {
      label: '比赛报名',
      text: [
        '关于举办第十二届校园歌手大赛的通知',
        '各学院、各班级：',
        `为丰富校园文化生活，现定于${dateOffsetLabel(4)}19:00在大学生活动中心报告厅举办第十二届校园歌手大赛初赛。请各班级于${dateOffsetLabel(2)}17:00前，将《校园歌手大赛报名表》电子版发送至学生会邮箱 xsh@campus.edu.cn，并提醒参赛同学携带学生证，提前20分钟到现场签到。`,
        '特此通知。',
      ].join('\n'),
    },
    {
      label: '奖学金',
      text: [
        '关于开展2025-2026学年国家励志奖学金评审工作的通知',
        '各学院：',
        `根据学校工作安排，现启动本学年国家励志奖学金评审。请符合条件的学生于${dateOffsetLabel(9)}前登录学生事务大厅（https://scholarship.edu.cn）填写《国家励志奖学金申请表》，并将纸质版材料交至行政楼201室。逾期不再受理。`,
      ].join('\n'),
    },
    {
      label: '线上培训',
      text: `线上培训通知：${dateOffsetLabel(4)}下午2:30通过腾讯会议（会议号：123-456-789）开展实验室安全培训，请全体研究生准时参加并完成签到。`,
    },
    {
      label: '校园卡',
      text: `校园卡中心通知：因系统升级，请尚未领取新校园卡的2026级同学于${dateOffsetLabel(3)}12:00前到一站式服务中心3号窗口领取，领取时须携带本人学生证。`,
    },
  ];

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // 隐私模式下 localStorage 可能不可用，页面本身仍可正常使用。
    }
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // ignore
    }
  }

  function readJSON(key, fallback) {
    const raw = safeStorageGet(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setToday() {
    const now = new Date();
    el.todayWeekday.textContent = WEEKDAYS[now.getDay()];
    el.todayDate.textContent = `${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
  }

  function showToast(message, options) {
    const opts = options || {};
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.toggle('is-error', Boolean(opts.error));
    el.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), opts.duration || 2500);
  }

  function updateCharCount() {
    const length = el.noticeInput.value.replace(/\s/g, '').length;
    el.charCount.textContent = `${length} 字`;
  }

  function renderSampleChips() {
    el.sampleChips.innerHTML = '';
    samples.forEach((sample, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sample-chip';
      button.dataset.index = String(index);
      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      const text = document.createElement('span');
      text.textContent = sample.label;
      button.append(dot, text);
      button.addEventListener('click', () => {
        el.noticeInput.value = sample.text;
        updateCharCount();
        parseCurrentInput({ scroll: true });
      });
      el.sampleChips.appendChild(button);
    });
  }

  function setLoading(loading) {
    el.parseButton.classList.toggle('is-loading', loading);
    el.parseButton.disabled = loading;
  }

  function parseCurrentInput(options) {
    const opts = options || {};
    const text = el.noticeInput.value.trim();
    if (text.length < 6) {
      el.noticeInput.closest('.notice-field').classList.remove('is-invalid');
      void el.noticeInput.offsetWidth;
      el.noticeInput.closest('.notice-field').classList.add('is-invalid');
      el.noticeInput.focus();
      showToast('先粘贴一段通知，再提取代办。', { error: true });
      return;
    }

    clearTimeout(loadingTimer);
    setLoading(true);
    loadingTimer = setTimeout(() => {
      try {
        const result = parser.parseNotice(text);
        if (!result.ok) throw new Error(result.error || '解析失败');
        applyResult(result, {
          recordHistory: true,
          scroll: opts.scroll !== false,
          toast: true,
        });
      } catch (error) {
        showToast(error.message || '这段通知暂时没解析出来，请稍后再试。', { error: true });
      } finally {
        setLoading(false);
      }
    }, 260);
  }

  function applyResult(result, options) {
    const opts = options || {};
    current = result;
    if (!current.historyId) {
      const existing = history.find((entry) => entry.text === result.text);
      current.historyId = existing
        ? existing.historyId
        : `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }
    current.savedAt = current.savedAt || new Date().toISOString();

    el.noticeInput.value = result.text;
    updateCharCount();
    renderResult(current);
    if (opts.recordHistory) rememberCurrent();

    saveDraft();
    saveCurrent();
    renderHistory();

    if (opts.scroll && window.innerWidth <= 860) {
      document.getElementById('tasks').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (opts.toast) {
      const count = current.tasks.length;
      showToast(`已拆成 ${count} 项待办，按顺序做就行。`);
    }
  }

  function renderResult(result) {
    el.emptyState.hidden = true;
    el.resultContent.hidden = false;
    el.coverageBadge.hidden = false;
    el.coverageBadge.textContent = `${result.coverage}/${result.coverageTotal} 字段`;

    const categoryKey = result.category ? result.category.key : 'general';
    const categoryLabel = result.category ? result.category.label : '校园通知';
    el.categoryChip.className = `category-chip cat-${categoryKey}`;
    el.categoryChip.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-${CATEGORY_ICONS[categoryKey] || 'list'}"></use></svg><span>${escapeHTML(categoryLabel)}</span>`;

    el.resultTitle.textContent = result.title || '校园通知';
    el.resultSummary.textContent = result.summary || '已提取关键信息，请按清单逐项完成。';

    el.whatValue.textContent = result.title || '校园通知';
    el.whatSub.textContent = `${categoryLabel} · ${result.tasks.length} 个步骤`;

    renderDeadline(result);
    renderLocation(result);
    renderEventStrip(result);

    el.todoValue.textContent = `${result.tasks.length} 项待办`;
    const firstUndone = result.tasks.find((task) => !task.done) || result.tasks[0];
    el.todoSub.textContent = firstUndone ? `先做：${firstUndone.title}` : '通知里没有找到明确动作';

    el.sourceText.textContent = result.text;
    el.sourceDetails.open = false;
    renderTasks();
  }

  function renderDeadline(result) {
    const deadline = result.deadline;
    if (!deadline) {
      el.whenLabel.textContent = '什么时候截止';
      el.whenValue.textContent = '未写明时间';
      el.whenSub.innerHTML = '<span class="relative-badge is-past">待确认</span> 通知里没有明确日期';
      return;
    }

    const date = new Date(deadline.iso);
    el.whenLabel.textContent = deadline.inferred ? '关键时间' : '什么时候截止';
    el.whenValue.textContent = `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;

    const relative = relativeDeadline(date);
    const urgentClass = relative.urgent ? ' is-urgent' : relative.past ? ' is-past' : '';
    const timeText = deadline.hasTime
      ? `${pad(date.getHours())}:${pad(date.getMinutes())} ${deadline.inferred ? '开始' : '截止'}`
      : '当日截止（原文未写具体时间）';
    const prefix = deadline.inferred ? '按活动时间提醒 · ' : '';
    el.whenSub.innerHTML = `<span class="relative-badge${urgentClass}">${escapeHTML(relative.label)}</span>${escapeHTML(prefix + timeText)}`;
  }

  function renderLocation(result) {
    const location = result.location || { name: '详见通知', mode: 'unknown' };
    el.whereValue.textContent = location.name || '详见通知';
    el.whereSub.textContent =
      location.mode === 'online' ? '线上进行 · 记得提前测试设备' :
      location.mode === 'offline' ? '线下办理 · 建议提前 10 分钟到' :
      '以通知原文为准';
  }

  function renderEventStrip(result) {
    if (!result.eventTime) {
      el.eventStrip.hidden = true;
      return;
    }
    const eventIso = result.eventTime.iso;
    if (result.deadline && result.deadline.iso === eventIso) {
      el.eventStrip.hidden = true;
      return;
    }
    const date = new Date(eventIso);
    el.eventStripText.textContent = `活动 / 开始：${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    el.eventStrip.hidden = false;
  }

  function relativeDeadline(date) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = Math.round((target - start) / 86400000);
    if (date.getTime() < now.getTime()) {
      return { label: diff === 0 ? '今天已截止' : `已截止 ${Math.abs(diff)} 天`, urgent: true, past: true };
    }
    if (diff === 0) return { label: '今天截止', urgent: true, past: false };
    if (diff === 1) return { label: '明天截止', urgent: true, past: false };
    if (diff <= 7) return { label: `还剩 ${diff} 天`, urgent: false, past: false };
    return { label: `还有 ${diff} 天`, urgent: false, past: false };
  }

  function formatTaskDue(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = Math.round((target - start) / 86400000);
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (diff < 0) return `已过期 · ${date.getMonth() + 1}/${date.getDate()}`;
    if (diff === 0) return `今天 ${time}`;
    if (diff === 1) return `明天 ${time}`;
    if (date.getHours() === 23 && date.getMinutes() === 59) {
      return `${date.getMonth() + 1}/${date.getDate()} 截止`;
    }
    return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
  }

  function renderTasks() {
    if (!current) return;
    el.taskList.innerHTML = '';

    current.tasks.forEach((task, index) => {
      const item = document.createElement('li');
      item.className = `task-item${task.done ? ' is-done' : ''}`;
      item.style.setProperty('--i', String(index));

      const checkLabel = document.createElement('label');
      checkLabel.className = 'task-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.done);
      checkbox.setAttribute('aria-label', `${task.done ? '取消完成' : '完成'}：${task.title}`);
      const checkBox = document.createElement('span');
      checkBox.className = 'check-box';
      checkBox.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
      checkLabel.append(checkbox, checkBox);
      checkbox.addEventListener('change', () => {
        const wasAllDone = current.tasks.every((entry) => entry.done);
        task.done = checkbox.checked;
        item.classList.toggle('is-done', task.done);
        checkbox.setAttribute('aria-label', `${task.done ? '取消完成' : '完成'}：${task.title}`);
        updateProgress();
        syncCurrent();
        if (!wasAllDone && current.tasks.every((entry) => entry.done)) {
          showToast('全部完成，今天没有漏项。');
        }
      });

      const main = document.createElement('div');
      main.className = 'task-main';

      const titleRow = document.createElement('div');
      titleRow.className = 'task-title-row';
      const title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = task.title;
      const kind = document.createElement('span');
      kind.className = `task-kind kind-${task.kind || '其他'}`;
      kind.textContent = task.kindLabel || '待办';
      titleRow.append(title, kind);

      main.appendChild(titleRow);

      if (task.detail && task.detail !== task.title) {
        const detail = document.createElement('p');
        detail.className = 'task-detail';
        detail.textContent = task.detail;
        main.appendChild(detail);
      }

      const dueText = formatTaskDue(task.due);
      if (dueText) {
        const due = document.createElement('span');
        due.className = `task-due${dueText.startsWith('已过期') ? ' is-overdue' : ''}`;
        due.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-clock"></use></svg>';
        due.appendChild(document.createTextNode(dueText));
        main.appendChild(due);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'task-delete';
      remove.setAttribute('aria-label', `删除：${task.title}`);
      remove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>';
      remove.addEventListener('click', () => {
        current.tasks = current.tasks.filter((entry) => entry.id !== task.id);
        renderTasks();
        updateProgress();
        renderResultSummaryBits();
        syncCurrent();
        showToast('已删除这一项。');
      });

      item.append(checkLabel, main, remove);
      el.taskList.appendChild(item);
    });

    updateProgress();
  }

  function renderResultSummaryBits() {
    if (!current) return;
    el.whatSub.textContent = `${current.category ? current.category.label : '校园通知'} · ${current.tasks.length} 个步骤`;
    el.todoValue.textContent = `${current.tasks.length} 项待办`;
    const firstUndone = current.tasks.find((task) => !task.done) || current.tasks[0];
    el.todoSub.textContent = firstUndone ? `先做：${firstUndone.title}` : '通知里没有找到明确动作';
  }

  function updateProgress() {
    if (!current) return;
    const total = current.tasks.length;
    const done = current.tasks.filter((task) => task.done).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    el.progressText.textContent = `${done}/${total}`;
    el.taskCountLabel.textContent = `${total} 项`;
    el.progressBar.style.width = `${percent}%`;
    el.progressBar.classList.toggle('is-complete', total > 0 && done === total);
  }

  function rememberCurrent() {
    if (!current) return;
    const index = history.findIndex((entry) => entry.historyId === current.historyId);
    const snapshot = deepClone(current);
    if (index !== -1) history.splice(index, 1);
    history.unshift(snapshot);
    history = history.slice(0, 8);
  }

  function syncCurrent() {
    if (!current) return;
    current.savedAt = new Date().toISOString();
    const entry = history.find((item) => item.historyId === current.historyId);
    if (entry) {
      const updated = deepClone(current);
      Object.keys(entry).forEach((key) => delete entry[key]);
      Object.assign(entry, updated);
    }
    saveCurrent();
    saveHistory();
    renderHistory();
  }

  function saveDraft() {
    safeStorageSet(STORAGE.draft, el.noticeInput.value);
  }

  function saveCurrent() {
    if (!current) {
      safeStorageSet(STORAGE.current, JSON.stringify({ cleared: true }));
      return;
    }
    safeStorageSet(STORAGE.current, JSON.stringify({ cleared: false, result: current }));
  }

  function saveHistory() {
    safeStorageSet(STORAGE.history, JSON.stringify(history));
  }

  function loadHistory() {
    const stored = readJSON(STORAGE.history, []);
    history = Array.isArray(stored) ? stored.filter((entry) => entry && entry.tasks).slice(0, 8) : [];
  }

  function renderHistory() {
    el.historyCount.textContent = String(history.length);
    el.miniHistory.hidden = history.length === 0;

    el.miniHistoryList.innerHTML = '';
    history.slice(0, 2).forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mini-history-item';
      const title = document.createElement('span');
      title.textContent = entry.title;
      const due = document.createElement('em');
      due.textContent = entry.deadline ? shortDate(new Date(entry.deadline.iso)) : '无期限';
      button.append(title, due);
      button.addEventListener('click', () => openHistoryEntry(entry.historyId));
      el.miniHistoryList.appendChild(button);
    });

    el.historyList.innerHTML = '';
    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = '还没有历史记录。解析第一条通知后，它会出现在这里。';
      el.historyList.appendChild(empty);
      return;
    }

    history.forEach((entry) => {
      const total = entry.tasks.length;
      const done = entry.tasks.filter((task) => task.done).length;
      const card = document.createElement('div');
      card.className = 'history-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `打开历史清单：${entry.title}`);

      const title = document.createElement('h3');
      title.textContent = entry.title;
      const meta = document.createElement('p');
      const saved = entry.savedAt ? new Date(entry.savedAt) : null;
      meta.textContent = `${entry.category ? entry.category.label : '校园通知'} · ${saved ? `${saved.getMonth() + 1}.${saved.getDate()} 保存` : '已保存'}`;
      const progress = document.createElement('span');
      progress.className = 'history-progress';
      progress.innerHTML = `<i><b style="width:${total ? Math.round((done / total) * 100) : 0}%"></b></i>${done}/${total} 已完成`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'history-delete';
      remove.setAttribute('aria-label', `删除历史：${entry.title}`);
      remove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        history = history.filter((item) => item.historyId !== entry.historyId);
        saveHistory();
        renderHistory();
        showToast('已删除这条历史记录。');
      });

      card.append(title, meta, progress, remove);
      card.addEventListener('click', () => openHistoryEntry(entry.historyId));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openHistoryEntry(entry.historyId);
        }
      });
      el.historyList.appendChild(card);
    });
  }

  function shortDate(date) {
    return `${date.getMonth() + 1}.${pad(date.getDate())}`;
  }

  function openHistoryEntry(historyId) {
    const entry = history.find((item) => item.historyId === historyId);
    if (!entry) return;
    closeDrawer();
    current = deepClone(entry);
    el.noticeInput.value = current.text;
    updateCharCount();
    renderResult(current);
    saveDraft();
    saveCurrent();
    if (window.innerWidth <= 860) {
      document.getElementById('tasks').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    showToast('已打开这份历史清单。');
  }

  function openDrawer() {
    el.historyBackdrop.hidden = false;
    el.historyDrawer.classList.add('is-open');
    el.historyDrawer.setAttribute('aria-hidden', 'false');
    el.historyToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-open');
    setTimeout(() => el.historyClose.focus(), 80);
  }

  function closeDrawer() {
    el.historyDrawer.classList.remove('is-open');
    el.historyDrawer.setAttribute('aria-hidden', 'true');
    el.historyToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
    setTimeout(() => {
      if (!el.historyDrawer.classList.contains('is-open')) el.historyBackdrop.hidden = true;
    }, 280);
  }

  function clearWorkspace() {
    clearTimeout(loadingTimer);
    setLoading(false);
    current = null;
    el.noticeInput.value = '';
    updateCharCount();
    el.emptyState.hidden = false;
    el.resultContent.hidden = true;
    el.coverageBadge.hidden = true;
    el.sourceDetails.open = false;
    safeStorageSet(STORAGE.current, JSON.stringify({ cleared: true }));
    saveDraft();
    el.noticeInput.focus();
    showToast('已清空，可以粘贴下一条通知了。');
  }

  function addManualTask(event) {
    event.preventDefault();
    if (!current) return;
    const title = el.addTaskInput.value.trim();
    if (!title) {
      el.addTaskInput.focus();
      return;
    }
    current.tasks.push({
      id: `task-manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      detail: '',
      source: '',
      kind: '自定',
      kindLabel: '自定',
      due: current.deadline ? current.deadline.iso : null,
      dueInferred: true,
      done: false,
    });
    el.addTaskInput.value = '';
    renderTasks();
    renderResultSummaryBits();
    syncCurrent();
    showToast('已加进清单。');
  }

  async function copyChecklist() {
    if (!current) return;
    const date = current.deadline ? new Date(current.deadline.iso) : null;
    const lines = [`【${current.title}】`];
    if (date) lines.push(`截止：${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`);
    if (current.eventTime) {
      const eventDate = new Date(current.eventTime.iso);
      lines.push(`活动：${eventDate.getFullYear()}年${eventDate.getMonth() + 1}月${eventDate.getDate()}日 ${pad(eventDate.getHours())}:${pad(eventDate.getMinutes())}`);
    }
    lines.push(`地点：${current.location ? current.location.name : '详见通知'}`);
    lines.push('', '待办清单：');
    current.tasks.forEach((task, index) => {
      lines.push(`${index + 1}. ${task.done ? '☑' : '□'} ${task.title}${task.detail ? `（${task.detail}）` : ''}`);
    });
    lines.push('', '—— 来自「校园代办」');

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      showToast('清单已复制，可以发给同学了。');
    } catch (error) {
      const temp = document.createElement('textarea');
      temp.value = lines.join('\n');
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand('copy');
        showToast('清单已复制，可以发给同学了。');
      } catch (copyError) {
        showToast('复制失败，请手动选择文字。', { error: true });
      }
      temp.remove();
    }
  }

  function icsEscape(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function icsDate(date) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
  }

  function buildCalendarEvent(summary, start, description, uidSuffix) {
    const end = new Date(start.getTime() + 30 * 60000);
    return [
      'BEGIN:VEVENT',
      `UID:${Date.now()}-${uidSuffix}@campus-concierge.local`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(summary)}`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  }

  function exportCalendar() {
    if (!current) return;
    const deadlineDate = current.deadline ? new Date(current.deadline.iso) : null;
    const eventDate = current.eventTime ? new Date(current.eventTime.iso) : null;
    if (!deadlineDate && !eventDate) {
      showToast('这条通知没有可导出的时间。', { error: true });
      return;
    }

    const description = [
      `地点：${current.location ? current.location.name : '详见通知'}`,
      '',
      '待办清单：',
      ...current.tasks.map((task, index) => `${index + 1}. ${task.title}`),
      '',
      '由校园代办生成',
    ].join('\n');

    const events = [];
    if (deadlineDate) events.push(buildCalendarEvent(`截止：${current.title}`, deadlineDate, description, 'deadline'));
    if (eventDate && (!deadlineDate || eventDate.getTime() !== deadlineDate.getTime())) {
      events.push(buildCalendarEvent(`开始：${current.title}`, eventDate, description, 'event'));
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Campus Concierge//CN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:校园代办',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `校园代办-${(current.title || '清单').replace(/[\\/:*?"<>|]/g, '').slice(0, 24)}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('日历文件已导出，双击即可导入。');
  }

  function restoreSession() {
    const saved = readJSON(STORAGE.current, null);
    const draft = safeStorageGet(STORAGE.draft);

    loadHistory();
    renderHistory();

    if (saved && saved.cleared) {
      current = null;
      el.noticeInput.value = '';
      el.emptyState.hidden = false;
      el.resultContent.hidden = true;
      el.coverageBadge.hidden = true;
      updateCharCount();
      return;
    }

    if (saved && saved.result && saved.result.tasks) {
      current = saved.result;
      el.noticeInput.value = typeof draft === 'string' ? draft : current.text;
      updateCharCount();
      renderResult(current);
      return;
    }

    if (typeof draft === 'string' && draft.trim()) {
      el.noticeInput.value = draft;
      updateCharCount();
      try {
        const result = parser.parseNotice(draft);
        if (result.ok) {
          current = result;
          renderResult(current);
          saveCurrent();
          return;
        }
      } catch (error) {
        // 落到示例
      }
    }

    const sample = samples[0];
    el.noticeInput.value = sample.text;
    updateCharCount();
    const result = parser.parseNotice(sample.text);
    current = result;
    current.historyId = `note-${Date.now()}-demo`;
    current.savedAt = new Date().toISOString();
    renderResult(current);
    rememberCurrent();
    renderHistory();
    saveHistory();
    saveCurrent();
    saveDraft();
  }

  function bindEvents() {
    el.parseButton.addEventListener('click', () => parseCurrentInput({ scroll: true }));

    el.noticeInput.addEventListener('input', () => {
      updateCharCount();
      saveDraft();
      el.noticeInput.closest('.notice-field').classList.remove('is-invalid');
    });

    el.noticeInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        parseCurrentInput({ scroll: true });
      }
    });

    el.clearButton.addEventListener('click', clearWorkspace);
    el.emptySampleButton.addEventListener('click', () => {
      el.noticeInput.value = samples[0].text;
      updateCharCount();
      parseCurrentInput({ scroll: true });
    });

    el.addTaskForm.addEventListener('submit', addManualTask);
    el.copyButton.addEventListener('click', copyChecklist);
    el.icsButton.addEventListener('click', exportCalendar);

    el.historyToggle.addEventListener('click', openDrawer);
    el.historyClose.addEventListener('click', closeDrawer);
    el.historyBackdrop.addEventListener('click', closeDrawer);
    el.openHistoryFromMini.addEventListener('click', openDrawer);

    el.clearHistoryButton.addEventListener('click', () => {
      if (!history.length) {
        showToast('没有可清空的历史记录。');
        return;
      }
      history = [];
      saveHistory();
      renderHistory();
      showToast('历史记录已清空。');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && el.historyDrawer.classList.contains('is-open')) {
        closeDrawer();
      }
    });
  }

  setToday();
  renderSampleChips();
  bindEvents();
  restoreSession();
})();
