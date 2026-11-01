/**
 * CampusParser — 校园通知结构化解析器
 * 纯前端、无依赖：从一段中文通知中提取「什么事 / 什么时候 / 要做什么 / 在哪办」。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CampusParser = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const CN_DIGITS = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };

  const CATEGORY_RULES = [
    { key: 'activity', label: '活动报名', words: ['歌手', '大赛', '比赛', '演出', '晚会', '讲座', '沙龙', '论坛', '分享会', '社团', '运动会', '志愿', '活动', '观影', '展览', '读书会'] },
    { key: 'award', label: '评奖申报', words: ['奖学金', '助学金', '评优', '评选', '评奖', '先进个人', '优秀学生', '申报', '评审', '答辩'] },
    { key: 'exam', label: '教务考试', words: ['考试', '补考', '缓考', '四六级', '选课', '重修', '课程', '答辩', '毕业论文', '学籍', '成绩'] },
    { key: 'pickup', label: '领取办理', words: ['领取', '发放', '校园卡', '学生证', '证书', '奖品', '物资', '快递', '办理', '补办'] },
    { key: 'payment', label: '缴费事务', words: ['缴费', '缴纳', '学费', '住宿费', '费用', '支付'] },
    { key: 'career', label: '就业实习', words: ['招聘', '宣讲', '实习', '就业', '简历', '面试', '双选会'] },
    { key: 'admin', label: '事务办理', words: ['办理', '登记', '审核', '盖章', '证明', '档案', '户口', '医保'] },
  ];

  const ACTION_GROUPS = [
    { kind: '材料', label: '材料', words: ['发送至', '发送到', '提交至', '提交到', '报送至', '报送', '上传至', '上传', '递交', '上交', '提交', '发送', '交至', '交到', '邮寄', '打印', '复印', '装订', '盖章', '签字', '签署', '收集', '汇总', '统计'] },
    { kind: '报名', label: '报名', words: ['报名', '填报', '填写', '申请', '注册', '预约', '登记'] },
    { kind: '到场', label: '到场', words: ['参加', '出席', '签到', '报到', '集合', '参会', '观赛', '观看'] },
    { kind: '准备', label: '准备', words: ['携带', '准备', '下载', '领取', '阅读', '学习', '核对', '确认', '打印'] },
    { kind: '缴费', label: '缴费', words: ['缴纳', '缴费', '支付', '转账'] },
    { kind: '联络', label: '联络', words: ['联系', '回复', '加入', '扫码', '咨询', '关注'] },
  ];

  const ALL_ACTIONS = Array.from(
    new Set(ACTION_GROUPS.flatMap((group) => group.words))
  ).sort((a, b) => b.length - a.length);

  const TIME_RE = /(上午|下午|晚上|中午|早上|凌晨|傍晚)?\s*(\d{1,2})\s*(?::|点|时)\s*(\d{1,2})?\s*分?/;
  const DATE_RE = /(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g;
  const ISO_DATE_RE = /(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})/g;
  const RELATIVE_DAY_RE = /(今天|今日|明天|明日|后天|大后天)/g;
  const WEEKDAY_RE = /(本周|这周|下周|下个?星期|周|星期)([一二三四五六日天1-7])/g;

  function normalize(text) {
    return String(text || '')
      .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248))
      .replace(/：/g, ':')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/\u3000/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ');
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function dayDiff(a, b) {
    return Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
  }

  function makeDate(year, month, day, hour, minute) {
    const d = new Date(year, month - 1, day, hour == null ? 23 : hour, minute == null ? 59 : minute, 0, 0);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }

  function cnNumber(value) {
    if (/^\d+$/.test(value)) return Number(value);
    if (value.length === 1) return CN_DIGITS[value] != null ? CN_DIGITS[value] : null;
    if (value === '十') return 10;
    if (value.startsWith('十')) return 10 + (CN_DIGITS[value[1]] || 0);
    if (value.endsWith('十')) return (CN_DIGITS[value[0]] || 0) * 10;
    if (value.includes('十')) {
      const [a, b] = value.split('十');
      return (CN_DIGITS[a] || 0) * 10 + (CN_DIGITS[b] || 0);
    }
    return null;
  }

  function parseTime(raw) {
    if (!raw) return null;
    const match = raw.match(TIME_RE);
    if (!match) return null;
    let hour = Number(match[2]);
    const minute = match[3] == null ? 0 : Number(match[3]);
    const period = match[1] || '';
    if ((period === '下午' || period === '晚上' || period === '傍晚') && hour < 12) hour += 12;
    if (period === '中午' && hour < 11) hour += 12;
    if (hour > 23 || minute > 59) return null;
    return {
      hour,
      minute,
      label: `${pad(hour)}:${pad(minute)}`,
      hasTime: true,
    };
  }

  function extractTimeNear(text, dateStart, dateEnd) {
    const before = text.slice(Math.max(0, dateStart - 8), dateStart);
    const after = text.slice(dateEnd, Math.min(text.length, dateEnd + 24))
      .replace(/[（(][^）)]{1,12}[）)]/g, ' ');
    const afterTime = parseTime(after);
    if (afterTime) return afterTime;
    // 「下午3点，11月3日」这类倒装表达
    return parseTime(before);
  }

  function sentenceAround(text, index, length) {
    let start = index;
    let end = index + length;
    while (start > 0 && !/[。！？；;\n]/.test(text[start - 1])) start -= 1;
    while (end < text.length && !/[。！？；;\n]/.test(text[end])) end += 1;
    return text.slice(start, Math.min(end, text.length));
  }

  function clauseAround(text, index, length) {
    let start = index;
    let end = index + length;
    while (start > 0 && !/[。！？；;，,\n]/.test(text[start - 1])) start -= 1;
    while (end < text.length && !/[。！？；;，,\n]/.test(text[end])) end += 1;
    return text.slice(start, Math.min(end, text.length));
  }

  function hasExplicitDeadline(text) {
    return /(截止|截至|之前|以前|前(?:完成|提交|发送|上传|报名|确认|缴费|报送)|请于|须于|务必于)/.test(text);
  }

  function collectDateCandidates(text, now) {
    const candidates = [];
    const seen = new Set();

    function addCandidate(obj) {
      if (!obj || !obj.date) return;
      const key = `${obj.date.getTime()}|${obj.index}`;
      if (seen.has(key)) return;
      seen.add(key);
      const sentence = sentenceAround(text, obj.index, obj.length);
      const clause = clauseAround(text, obj.index, obj.length);
      const before = text.slice(Math.max(0, obj.index - 18), obj.index);
      const after = text.slice(obj.index + obj.length, obj.index + obj.length + 18);
      const context = `${before}${obj.match}${after}`;
      let score = 0;

      if (/(截止|截至)/.test(before)) score += 7;
      if (/(截止|截至)/.test(after)) score += 5;
      if (/(前|之前|以前)/.test(after.slice(0, 8))) score += 5;
      if (/[至到\-—~～]\s*$/.test(before)) score += 6;
      if (/(请于|须于|务必于|应于|限于)/.test(before)) score += 3;
      if (/(报名|提交|上交|申请|材料|表格|发送|上传|报送|缴费|缴纳|确认|登记|回复)/.test(sentence)) score += 4;
      if (/(活动时间|讲座时间|比赛时间|开始时间|举行时间|会议时间|考试时间)/.test(clause)) score -= 6;
      if (/(举行|举办|开展|开始|开赛|开幕)/.test(clause)) score -= 2;
      if (/(今天|明天|后天|本周|下周)/.test(obj.match)) score += 1;
      if (obj.explicitYear) score += 1;
      if (obj.date.getTime() < now.getTime()) score -= 9;
      if (/(前|之前|以前)/.test(after.slice(0, 4))) score += 1;

      candidates.push({
        ...obj,
        sentence,
        clause,
        context,
        score,
        explicitDeadline: hasExplicitDeadline(context) || /(前|之前|以前)/.test(after.slice(0, 10)),
      });
    }

    let match;
    DATE_RE.lastIndex = 0;
    while ((match = DATE_RE.exec(text)) !== null) {
      const year = match[1] ? Number(match[1]) : now.getFullYear();
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      let date = makeDate(year, month, day, 23, 59);
      if (!date) continue;
      if (!match[1] && date.getTime() < now.getTime() - 86400000 * 60) {
        date = makeDate(year + 1, month, day, 23, 59) || date;
      }
      const time = extractTimeNear(text, match.index, match.index + match[0].length);
      if (time) date = makeDate(date.getFullYear(), date.getMonth() + 1, date.getDate(), time.hour, time.minute);
      addCandidate({
        date,
        index: match.index,
        length: match[0].length,
        match: match[0],
        hasTime: Boolean(time),
        explicitYear: Boolean(match[1]),
        time,
        source: 'absolute',
      });
    }

    ISO_DATE_RE.lastIndex = 0;
    while ((match = ISO_DATE_RE.exec(text)) !== null) {
      // 避免把 17:00 之类的时刻误认为日期
      if (!match[1] && !/[./-]/.test(match[0])) continue;
      const year = match[1] ? Number(match[1]) : now.getFullYear();
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      let date = makeDate(year, month, day, 23, 59);
      if (!date) continue;
      const time = extractTimeNear(text, match.index, match.index + match[0].length);
      if (time) date = makeDate(date.getFullYear(), date.getMonth() + 1, date.getDate(), time.hour, time.minute);
      addCandidate({
        date,
        index: match.index,
        length: match[0].length,
        match: match[0],
        hasTime: Boolean(time),
        explicitYear: Boolean(match[1]),
        time,
        source: 'iso',
      });
    }

    RELATIVE_DAY_RE.lastIndex = 0;
    while ((match = RELATIVE_DAY_RE.exec(text)) !== null) {
      const offsets = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3 };
      const base = startOfDay(now);
      base.setDate(base.getDate() + offsets[match[1]]);
      const time = extractTimeNear(text, match.index, match.index + match[0].length);
      const date = makeDate(base.getFullYear(), base.getMonth() + 1, base.getDate(), time ? time.hour : 23, time ? time.minute : 59);
      addCandidate({
        date,
        index: match.index,
        length: match[0].length,
        match: match[0],
        hasTime: Boolean(time),
        explicitYear: false,
        time,
        source: 'relative',
      });
    }

    WEEKDAY_RE.lastIndex = 0;
    while ((match = WEEKDAY_RE.exec(text)) !== null) {
      const prefix = match[1];
      const dayChar = match[2];
      const target = dayChar === '天' ? 7 : dayChar === '日' ? 0 : Number(dayChar) || '一二三四五六'.indexOf(dayChar) + 1;
      // 忽略「11月3日（周二）」中重复的星期注释
      const beforeChar = text[match.index - 1];
      if ((beforeChar === '(' || beforeChar === '（') && /[日号]/.test(text[match.index - 2] || '')) continue;
      const base = startOfDay(now);
      const current = base.getDay();
      const monday = new Date(base);
      monday.setDate(base.getDate() - ((current + 6) % 7));
      let date = new Date(monday);
      date.setDate(monday.getDate() + ((target + 6) % 7));
      if (prefix === '下周' || prefix === '下个星期') date.setDate(date.getDate() + 7);
      if ((prefix === '周' || prefix === '星期')) {
        if (date.getTime() < base.getTime()) date.setDate(date.getDate() + 7);
      }
      if ((prefix === '本周' || prefix === '这周') && date.getTime() < base.getTime() - 86400000) {
        date.setDate(date.getDate() + 7);
      }
      const time = extractTimeNear(text, match.index, match.index + match[0].length);
      const finalDate = makeDate(date.getFullYear(), date.getMonth() + 1, date.getDate(), time ? time.hour : 23, time ? time.minute : 59);
      addCandidate({
        date: finalDate,
        index: match.index,
        length: match[0].length,
        match: match[0],
        hasTime: Boolean(time),
        explicitYear: false,
        time,
        source: 'weekday',
      });
    }

    return candidates.sort((a, b) => a.index - b.index);
  }

  function pickDeadline(candidates, text) {
    if (!candidates.length) return null;
    const ranked = [...candidates].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.date.getTime() - b.date.getTime();
    });
    const best = ranked[0];
    const explicit = best.score >= 4 || best.explicitDeadline;
    return {
      ...best,
      inferred: !explicit,
      confidence: best.score >= 8 ? '明确' : explicit ? '较明确' : '推断',
    };
  }

  function pickEventTime(candidates, deadline) {
    const eventWords = /(活动时间|讲座时间|比赛时间|开始时间|举行时间|会议时间|考试时间|举行|举办|开展|开赛|开幕|初赛|决赛|签到)/;
    let eventCandidates = candidates.filter((candidate) => {
      if (deadline && candidate.index === deadline.index) return false;
      return eventWords.test(candidate.clause);
    });
    if (!eventCandidates.length) {
      eventCandidates = candidates.filter((candidate) => {
        if (deadline && candidate.index === deadline.index) return false;
        return eventWords.test(candidate.sentence) && !/(报名|提交|截止|材料)/.test(candidate.clause);
      });
    }
    if (!eventCandidates.length) return null;
    return eventCandidates.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  }

  function extractTitle(text) {
    const head = text.slice(0, 300);
    const bracket = head.match(/^\s*【([^】\n]{2,24})】/);
    if (bracket) return cleanTitle(bracket[1]);

    const patterns = [
      /关于(?:举办|开展|举行|组织|召开|做好|评选|申报|推荐|开展第?[一二三四五六七八九十\d]+届)?\s*([^，。；\n]{3,56}?)\s*(?:的)?通知/,
      /(?:举办|开展|举行|召开)\s*([^，。；\n]{3,48}?)(?:的)?(?:通知|活动|比赛|讲座|会议)/,
      /《([^》\n]{3,48})》/,
    ];
    for (const pattern of patterns) {
      const match = head.match(pattern);
      if (match && match[1]) {
        const title = cleanTitle(match[1]);
        if (title.length >= 3) return title;
      }
    }

    if (/校园卡/.test(head) && /(领取|补办|办理)/.test(head)) return '校园卡领取';
    if (/(学生证|证书|教材|物资)/.test(head) && /(领取|发放)/.test(head)) {
      const item = head.match(/(学生证|证书|教材|物资)/);
      return `${item[1]}领取`;
    }

    const lines = head.split('\n').map((line) => line.trim()).filter(Boolean);
    const firstLine = lines.find((line) => !/^(?:各学院|各班级|各位|全体|亲爱的|同学们)/.test(line)) || lines[0] || '';
    const beforeColon = firstLine.split(/[：:]/)[0].trim();
    if (beforeColon && beforeColon.length >= 3 && beforeColon.length <= 26 && !/^(?:各位|全体|亲爱的|同学们)/.test(beforeColon)) {
      return cleanTitle(beforeColon);
    }

    const submit = head.match(/将\s*([^，。；\n]{2,20}?)\s*(?:电子版|纸质版)?\s*(?:发送至|提交至|交至|报送至|上传至)/);
    if (submit) return cleanTitle(`${submit[1]}提交`);
    const fill = head.match(/(?:填写|填报)\s*([^，。；\n]{2,18}?)(?:[，。；\n]|$)/);
    if (fill) return cleanTitle(`${fill[1]}填写`);

    const firstClause = firstLine.split(/[，,。；;]/)[0].trim();
    if (firstClause.length >= 3 && !/^(?:各位|全体|亲爱的|同学们)/.test(firstClause)) {
      return cleanTitle(firstClause.slice(0, 24));
    }
    return `${detectCategory(text).label}通知`;
  }

  function cleanTitle(raw) {
    return String(raw || '')
      .replace(/^[#*\s]+/, '')
      .replace(/^(关于|关于开展|关于举办|关于举行|关于做好)/, '')
      .replace(/(?:的)?通知$/, '')
      .replace(/[，。；:：\s]+$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  }

  function extractSummary(text, title) {
    const cleaned = text
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const candidates = [];
    for (const line of cleaned) {
      if (/^(关于|各学院|各班级|各位|同学们|特此通知|附件|联系人|联系电话)/.test(line)) continue;
      if (line === title) continue;
      if (line.length < 12) continue;
      candidates.push(line);
    }
    let summary = candidates.find((line) => /(为|现定于|决定|将于|开展|举办|组织)/.test(line)) || candidates[0] || '';
    summary = summary
      .replace(/^[一二三四五六七八九十]+、/, '')
      .replace(/^[^：:\n]{0,22}(?:通知|公告)\s*[:：]\s*/, '')
      .trim();
    const firstSentence = summary.match(/^[^。！？!?]{16,}?[。！？!?]/);
    if (firstSentence) summary = firstSentence[0].trim();
    if (summary.length > 115) summary = `${summary.slice(0, 112)}…`;
    return summary || '已从通知中提取关键信息，请按清单逐项完成。';
  }

  function detectCategory(text) {
    for (const rule of CATEGORY_RULES) {
      if (rule.words.some((word) => text.includes(word))) return rule;
    }
    return { key: 'general', label: '校园通知', words: [] };
  }

  function extractLocation(text) {
    const normalized = text.replace(/\n/g, '\n');
    const lines = normalized.split('\n');
    for (const line of lines) {
      const labeled = line.match(/(?:活动|会议|比赛|讲座|考试|集合|报到|举办)?地点\s*:\s*([^。；;\n]+)/);
      if (labeled && labeled[1]) return cleanLocation(labeled[1]);
    }

    const platform = normalized.match(/(腾讯会议|钉钉|飞书|Zoom|zoom|雨课堂|学习通)/);
    if (platform) {
      const code = normalized.match(/(?:会议号|会议 ID|会议id|房间号)\s*[:：]?\s*([\d\s-]{5,24})/);
      return {
        name: `线上 · ${platform[1]}${code ? `（${code[1].trim()}）` : ''}`,
        mode: 'online',
      };
    }
    if (/(线上|云端|直播)/.test(normalized)) return { name: '线上进行', mode: 'online' };

    const placePattern = /(?:在|于)\s*([^，。；\n]{2,36}?)(?:举行|举办|开展|进行|集合|签到|报到|召开)/g;
    let inPlace;
    while ((inPlace = placePattern.exec(normalized)) !== null) {
      const candidate = inPlace[1];
      if (candidate && !/\d{1,2}月|星期|周[一二三四五六日天]|截止|前$|[0-2]\d:\d{2}/.test(candidate)) {
        return cleanLocation(candidate);
      }
    }

    const explicitPlace = normalized.match(/(?:交至|交到|提交至|提交到|送至|送到|前往|到|在)\s*([\u4e00-\u9fa5\d]{0,24}(?:大学生活动中心报告厅|活动中心报告厅|报告厅|会议室|阶梯教室|教室|体育馆|图书馆|活动中心|大礼堂|礼堂|操场|田径场|食堂|宿舍楼|教学楼|实验室|行政楼|一站式服务中心|服务大厅|广场|校医院|门诊部|咖啡厅|多功能厅|办公室|窗口)[\dA-Za-z号室楼\-]{0,8})/);
    if (explicitPlace) return cleanLocation(explicitPlace[1]);

    const building = normalized.match(/([\u4e00-\u9fa5A-Za-z()\-]{2,24}(?:报告厅|会议室|阶梯教室|教室|体育馆|图书馆|活动中心|大礼堂|礼堂|操场|田径场|食堂|宿舍楼|教学楼|实验室|行政楼|一站式服务中心|服务大厅|广场|校医院|门诊部|咖啡厅|多功能厅))/);
    if (building) return cleanLocation(building[1]);

    return { name: '详见通知', mode: 'unknown' };
  }

  function cleanLocation(raw) {
    let name = String(raw || '')
      .replace(/^[：:，,\s]+/, '')
      .replace(/[，,。；;\s]+$/, '')
      .replace(/^[0-9]{0,2}\s*(?:在|于)/, '')
      .replace(/[（(][一二三四五六日天\d]{1,4}[）)]/g, '')
      .trim();
    name = name.slice(0, 48);
    if (!name) return { name: '详见通知', mode: 'unknown' };
    const mode = /线上|腾讯会议|钉钉|飞书|Zoom|雨课堂|学习通|云端/.test(name) ? 'online' : 'offline';
    return { name, mode };
  }

  function findAction(segment) {
    let best = null;
    for (const action of ALL_ACTIONS) {
      let from = 0;
      let index = segment.indexOf(action, from);
      while (index !== -1) {
        const after = segment.slice(index + action.length, index + action.length + 2);
        const before = segment.slice(Math.max(0, index - 1), index);
        const nounLike =
          (/^(表|单|系统|入口|平台|链接|码|页面|通道)$/.test(after[0] || '') &&
            /(报名|申请|签到|登记|预约|缴费|提交)/.test(action)) ||
          (action === '参加' && /^赛/.test(after)) ||
          (action === '报名' && /^者/.test(after)) ||
          (action === '签到' && /^表/.test(after));
        if (!nounLike && (!best || index < best.index || (index === best.index && action.length > best.action.length))) {
          best = { action, index };
          break;
        }
        index = segment.indexOf(action, index + 1);
      }
    }
    if (!best) return null;
    for (const group of ACTION_GROUPS) {
      if (group.words.includes(best.action)) return { ...best, kind: group.kind, label: group.label };
    }
    return { ...best, kind: '其他', label: '待办' };
  }

  function cleanSegment(raw) {
    let text = String(raw || '')
      .replace(/^[，,；;。\s]+/, '')
      .replace(/^(?:各位|全体|亲爱的)?[^：:\n]{0,18}(?:同学|老师|朋友|大家)\s*[:：]\s*/, '')
      .replace(/^[^：:\n]{0,24}(?:通知|公告)\s*[:：]\s*/, '')
      .replace(/^(?:因|由于|为了|根据|按照|随着)[^，,]{1,48}[，,]\s*(?=(?:请|需|须|各|学生|同学|符合|有意|尚未))/, '')
      .replace(/^(?:请|烦请|需|须|务必|应|要求)\s*/, '')
      .replace(/^(?:各(?:学院|班级|系|部门|单位|位同学|位)|全体|所有|各位|同学们|学生|参赛同学|参会人员|相关人员)\s*/, '')
      .replace(/^(?:符合条件的学生|感兴趣[^，,]{0,26}?的?同学|需要[^，,]{0,28}?的?同学|有意(?:参加)?[^，,]{0,30}?的?同学|尚未[^，,]{0,28}?的?同学|尚未[^，,]{0,28}?的?学生|20\d{2}级[^，,]{0,16}?同学|(?:全体|所有)?(?:研究生|本科生|学生|同学|教师|党员|团员|志愿者|参赛人员|参会人员))\s*/, '')
      .replace(/^(?:请|烦请|需|须|务必)\s*/, '')
      .replace(/^(?:于|在|截至)\s*(?:今天|今日|明天|明日|后天|大后天|本周|这周|下周|下个?星期|周|星期)?[^，。；]{0,38}?(?:前|之前|以前)[，,]?\s*/, '')
      .replace(/^(?:于|在)\s*(?:今天|今日|明天|明日|后天|大后天|本周|这周|下周|下个?星期|周|星期)?[^，。；]{0,22}?(?:点|时|分)?\s*(?=(?:到|前往|参加|集合|签到|领取|办理))/, '')
      .replace(/^(?:领取|办理|参加|参会|活动|考试|报到)时(?:须|需|请)?\s*/, '')
      .replace(/[，,](?:逾期|过期|未按时|逾期未)[^，。；]*$/, '')
      .replace(/[。；;\s]+$/, '')
      .trim();
    text = text.replace(/^并\s*/, '').replace(/^同时\s*/, '').trim();
    return text;
  }

  function transformSegment(segment, action, rawSegment) {
    let title = segment;
    let detail = '';

    // 将《报名表》电子版发送至 xx → 提交《报名表》电子版
    const submit = title.match(/^(?:将|把)?\s*(.{2,48}?)\s*(电子版|纸质版|扫描件)?\s*(?:发送至|发送到|提交至|提交到|报送至|上传至|邮件至|发至|交至|交到)\s*(.+)$/);
    const loginFill = title.match(/^(?:登录|访问|进入)\s*(.+?)\s*(?:后)?\s*(?:填写|填报)\s*(.+)$/);
    const pickup = title.match(/^(?:到|前往)\s*(.+?)\s*(?:领取|办理)\s*(.*)$/);

    if (submit && /(发送|提交|报送|上传|交至|交到)/.test(action.action)) {
      const object = `${submit[1].replace(/[，,]$/, '').trim()}${submit[2] ? submit[2] : ''}`;
      const target = submit[3].replace(/[。；;]$/, '').trim();
      const sendVerb = /(发送|发至|上传|邮件)/.test(action.action) ? '发送至' : '提交至';
      title = `提交${object}`;
      detail = `${sendVerb} ${target}`;
    } else if (loginFill) {
      const site = loginFill[1].replace(/[，,]$/, '').trim();
      title = `填写${loginFill[2].replace(/[。；;]$/, '').trim()}`;
      detail = `登录 ${site}`;
    } else if (pickup) {
      const place = pickup[1].replace(/[，,]$/, '').trim();
      const object = pickup[2].replace(/[。；;]$/, '').trim();
      const hint = String(rawSegment || '').match(/(?:领取|补办|办理)([\u4e00-\u9fa5A-Za-z0-9]{2,12}?)(?:的|，|,|于|$)/);
      title = object ? `领取${object}` : hint ? `领取${hint[1]}` : `到${place}领取`;
      detail = `地点：${place}`;
    } else if (/^提醒/.test(title)) {
      detail = title;
    } else if (/^携带/.test(title)) {
      detail = title;
    } else if (/^参加|^出席/.test(title)) {
      detail = title;
    }

    title = title
      .replace(/^将\s*/, '')
      .replace(/^把\s*/, '')
      .replace(/[。；;，,]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (title.length > 48) title = `${title.slice(0, 46).trim()}…`;
    return { title, detail };
  }

  function explodeTaskSegments(sentence) {
    let parts = sentence.split(/(?:[，,]\s*(?:并|同时|另|还需|并且|以及|然后)|；(?:并|同时)?)/g);
    parts = parts.flatMap((part) => {
      // 「提醒参赛同学携带学生证，提前20分钟到现场签到」拆成两件事
      return part.split(/[，,](?=(?:提前|务必|请|需|须|参赛|参会|学生|同学|携带|下载|填写|提交|发送|上传|参加|领取时|活动时|于\d))/);
    });
    return parts.map((part) => part.trim()).filter(Boolean);
  }

  function extractTasks(text, overallDeadline, eventTime, now) {
    const rawSentences = text
      .replace(/\r/g, '')
      .split(/[。！？；;\n]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    const tasks = [];
    const seen = new Set();

    for (const sentence of rawSentences) {
      if (/^(关于|各学院|各班级|特此通知|附件|联系人|联系电话|备注)/.test(sentence)) continue;
      if (sentence.length < 4) continue;
      const body = sentence
        .replace(/^[^：:\n]{0,24}(?:通知|公告)\s*[:：]\s*/, '')
        .replace(/^(?:各位|全体|亲爱的)?[^：:\n]{0,18}(?:同学|老师|朋友|大家)\s*[:：]\s*/, '');
      const segments = explodeTaskSegments(body);
      for (const rawSegment of segments) {
        const segment = cleanSegment(rawSegment);
        if (segment.length < 3) continue;
        // 排除「时间：」「报名时间为……」这类日程元信息
        if (/(?:报名|考试|活动|讲座|会议|比赛)时间为/.test(segment) && !/(?:请|需|须|务必)/.test(segment)) continue;
        if (/^(?:时间|地点|报名时间|考试时间|活动时间)\s*[:：]/.test(segment)) continue;
        const action = findAction(segment);
        if (!action) continue;
        // 排除「通知」「活动」等名词性误命中
        if (/^(活动|比赛|讲座|会议)(时间|地点)/.test(segment)) continue;

        const transformed = transformSegment(segment, action, rawSegment);
        if (!transformed.title || transformed.title.length < 2) continue;
        const dedupeKey = transformed.title.replace(/[\s，,。；;]/g, '').slice(0, 28);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const localCandidates = collectDateCandidates(segment, now);
        const localDeadline = pickDeadline(localCandidates, segment);
        let due = localDeadline ? localDeadline.date : overallDeadline ? overallDeadline.date : null;
        let dueInferred = !localDeadline;

        // 到场、现场准备类任务优先使用活动时间，而不是报名截止时间
        if (
          eventTime &&
          (action.kind === '到场' ||
            (action.kind === '准备' && /(参赛|参会|现场|活动|入场|签到)/.test(segment)))
        ) {
          due = eventTime.date;
          dueInferred = false;
        }

        tasks.push({
          id: `task-${tasks.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
          title: transformed.title,
          detail: transformed.detail,
          source: segment,
          kind: action.kind,
          kindLabel: action.label,
          due: due ? due.toISOString() : null,
          dueInferred,
          done: false,
        });
        if (tasks.length >= 7) break;
      }
      if (tasks.length >= 7) break;
    }

    if (!tasks.length) {
      const fallbackAction = overallDeadline ? '在截止时间前完成通知要求的事项' : '阅读通知，确认需要办理的事项';
      tasks.push({
        id: `task-1-${Math.random().toString(36).slice(2, 7)}`,
        title: fallbackAction,
        detail: '通知中没有找到明确的动作要求，建议向发布方确认。',
        source: '',
        kind: '其他',
        kindLabel: '待办',
        due: overallDeadline ? overallDeadline.date.toISOString() : null,
        dueInferred: true,
        done: false,
      });
    }

    return tasks;
  }

  function formatDateParts(date) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      weekday: WEEKDAYS[date.getDay()],
      dateLabel: `${date.getMonth() + 1}月${date.getDate()}日`,
      fullLabel: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`,
      timeLabel: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    };
  }

  function relativeDeadline(date, now) {
    const diff = dayDiff(date, now);
    const time = date.getHours() * 60 + date.getMinutes();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (diff < 0) return `已截止 ${Math.abs(diff)} 天`;
    if (diff === 0) {
      if (date.getTime() < now.getTime()) return '今天已截止';
      return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())} 截止`;
    }
    if (diff === 1) return '明天截止';
    if (diff <= 7) return `还剩 ${diff} 天`;
    return `还有 ${diff} 天`;
  }

  function parseNotice(rawText, options) {
    const opts = options || {};
    const now = opts.now ? new Date(opts.now) : new Date();
    const text = normalize(rawText).trim();
    if (!text) {
      return {
        ok: false,
        error: '请先粘贴一段通知内容。',
        text: '',
        now,
      };
    }

    const title = extractTitle(text);
    const summary = extractSummary(text, title);
    const category = detectCategory(text);
    const candidates = collectDateCandidates(text, now);
    const deadline = pickDeadline(candidates, text);
    const eventTime = pickEventTime(candidates, deadline);
    const location = extractLocation(text);
    const tasks = extractTasks(text, deadline, eventTime, now);

    const coverage = [
      Boolean(title && title !== '校园通知'),
      Boolean(deadline),
      tasks.length > 0 && !(tasks.length === 1 && tasks[0].kind === '其他' && !tasks[0].source),
      location.mode !== 'unknown',
    ].filter(Boolean).length;

    return {
      ok: true,
      text,
      title,
      summary,
      category,
      deadline: deadline
        ? {
            iso: deadline.date.toISOString(),
            date: deadline.date,
            ...formatDateParts(deadline.date),
            hasTime: deadline.hasTime,
            inferred: deadline.inferred,
            confidence: deadline.confidence,
            relative: relativeDeadline(deadline.date, now),
            source: deadline.match,
          }
        : null,
      eventTime: eventTime
        ? {
            iso: eventTime.date.toISOString(),
            date: eventTime.date,
            ...formatDateParts(eventTime.date),
            hasTime: eventTime.hasTime,
            relative: relativeDeadline(eventTime.date, now),
            source: eventTime.match,
          }
        : null,
      location,
      tasks,
      coverage,
      coverageTotal: 4,
      parsedAt: now.toISOString(),
    };
  }

  return {
    parseNotice,
    _internal: {
      normalize,
      collectDateCandidates,
      pickDeadline,
      extractLocation,
      extractTasks,
      extractTitle,
      formatDateParts,
      relativeDeadline,
    },
  };
});
