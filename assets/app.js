/* 港式粵語 · 每日一課 —— 应用逻辑
 * 数据持久化：localStorage（真实部署环境可用；如遇不可用环境自动降级内存并提示）
 * 发音：Web Speech API（speechSynthesis），HK 粤语 voice 优先
 */
(function () {
  "use strict";

  var DATA = window.HK_DATA;
  var LS_KEY = "cantonese-daily-hk-v1";

  /* ---------------- 存储层（localStorage + 内存降级） ---------------- */
  var memStore = {};
  var storageOk = false;
  try {
    var t = "__test__";
    window.localStorage.setItem(t, "1");
    window.localStorage.removeItem(t);
    storageOk = true;
  } catch (e) {
    storageOk = false;
  }
  var store = {
    get: function () {
      if (storageOk) {
        try {
          var raw = window.localStorage.getItem(LS_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return memStore;
        }
      }
      return memStore;
    },
    set: function (data) {
      if (storageOk) {
        try {
          window.localStorage.setItem(LS_KEY, JSON.stringify(data));
          return true;
        } catch (e) {
          memStore = data;
          return false;
        }
      }
      memStore = data;
      return false;
    }
  };

  /* ---------------- 日期工具 ---------------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dateKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function todayKey() { return dateKey(new Date()); }
  function parseKey(key) {
    var p = key.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function daysBetween(a, b) {
    var ms = parseKey(a).getTime() - parseKey(b).getTime();
    return Math.round(ms / 86400000);
  }
  function fmtDate(d) {
    var week = ["日", "一", "二", "三", "四", "五", "六"];
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 · 週" + week[d.getDay()];
  }
  /* 按日期确定"今日词条"（词库轮换） */
  function lessonByDate(items) {
    var now = new Date();
    var dayNum = now.getFullYear() * 372 + (now.getMonth() + 1) * 31 + now.getDate();
    return items[dayNum % items.length];
  }

  /* ---------------- 状态 ---------------- */
  var state = {
    checkins: [],        // ["2026-09-12", ...]
    total: 0,
    goal: 21,            // 每月目标天数
    autoSpeak: true,
    showJyut: true,
    saved: true
  };

  function loadState() {
    var s = store.get();
    if (s && Array.isArray(s.checkins)) {
      state.checkins = s.checkins.filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); });
      state.total = typeof s.total === "number" ? s.total : state.checkins.length;
      state.goal = s.goal || 21;
      state.autoSpeak = s.autoSpeak !== false;
      state.showJyut = s.showJyut !== false;
      state.saved = true;
    } else {
      state.checkins = [];
      state.total = 0;
      state.goal = 21;
    }
    if (!storageOk) {
      toast("当前环境无法保存记录，刷新后会丢失");
    }
  }
  function saveState() {
    state.saved = store.set({
      checkins: state.checkins,
      total: state.total,
      goal: state.goal,
      autoSpeak: state.autoSpeak,
      showJyut: state.showJyut
    });
  }

  function isChecked(key) { return state.checkins.indexOf(key) !== -1; }
  function todayChecked() { return isChecked(todayKey()); }

  /* 本月打卡数 */
  function monthCount(year, month) {
    var prefix = year + "-" + pad(month + 1);
    return state.checkins.filter(function (k) { return k.indexOf(prefix) === 0; }).length;
  }
  /* 连续天数：从今天（或昨天）向前数 */
  function calcStreak() {
    var i = 0;
    var today = todayKey();
    var cursor = isChecked(today) ? today : (isChecked(dateKey(new Date(Date.now() - 86400000))) ? dateKey(new Date(Date.now() - 86400000)) : null);
    if (!cursor) return 0;
    while (true) {
      var d = parseKey(cursor);
      d.setDate(d.getDate() - 1);
      var prev = dateKey(d);
      if (isChecked(prev)) { i++; cursor = prev; }
      else break;
    }
    return i + 1;
  }

  /* ---------------- 今日课程索引 ---------------- */
  /* 今日词条：优先从问候语轮换池取；词库无问候语时回退到完整词库 */
  var todayWord = lessonByDate((DATA.greetings && DATA.greetings.length) ? DATA.greetings : DATA.words);
  var todayThink = lessonByDate(DATA.thinking);
  var todayCulture = lessonByDate(DATA.culture);

  /* ---------------- DOM 引用 ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    dateChip: $("dateChip"),
    checkinRing: $("checkinRing"),
    ringFg: $("ringFg"),
    ringNum: $("ringNum"),
    checkinHi: $("checkinHi"),
    statTotal: $("statTotal"),
    statStreak: $("statStreak"),
    statMonth: $("statMonth"),
    btnCheckin: $("btnCheckin"),
    checkedBanner: $("checkedBanner"),
    todayWordCard: $("todayWordCard"),
    todayThink: $("todayThink"),
    todayCulture: $("todayCulture"),
    goTodayWord: $("goTodayWord"),
    goTodayThink: $("goTodayThink"),
    goTodayCulture: $("goTodayCulture"),
    lessonWord: $("lessonWord"),
    wordIdx: $("wordIdx"),
    wordPrev: $("wordPrev"),
    wordNext: $("wordNext"),
    lessonPron: $("lessonPron"),
    pronIdx: $("pronIdx"),
    pronPrev: $("pronPrev"),
    pronNext: $("pronNext"),
    thinkList: $("thinkList"),
    cultureList: $("cultureList"),
    calMonth: $("calMonth"),
    calGrid: $("calGrid"),
    calPrev: $("calPrev"),
    calNext: $("calNext"),
    calTotal: $("calTotal"),
    calStreak: $("calStreak"),
    calGoal: $("calGoal"),
    streakTip: $("streakTip"),
    goalChips: $("goalChips"),
    swAutoSpeak: $("swAutoSpeak"),
    swShowJyut: $("swShowJyut"),
    dataInfo: $("dataInfo"),
    btnReset: $("btnReset"),
    toast: $("toast")
  };

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove("show"); }, 2200);
  }

  /* ---------------- 发音（TTS） ---------------- */
  var cachedVoice = null;
  function getHkVoice() {
    if (cachedVoice) return cachedVoice;
    if (!("speechSynthesis" in window)) return null;
    var voices = window.speechSynthesis.getVoices();
    var found = null;
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      if (/zh[-_]HK/i.test(v.lang) || /cantonese|粵/i.test(v.name)) { found = v; break; }
    }
    cachedVoice = found || null;
    return cachedVoice;
  }
  /* 播放本地预生成粤语音频（assets/audio/，百度 TTS 度晓芸广东话） */
  var localAudio = null;
  function playLocalAudio(url) {
    try {
      if (localAudio) { localAudio.pause(); }
      localAudio = new Audio();
      localAudio.preload = "auto";
      localAudio.src = url;
      localAudio.onerror = function () { toast("音频載入失敗，請檢查網絡"); };
      var p = localAudio.play();
      if (p && p.catch) p.catch(function () { toast("点击播放被拦截，請再點一次"); });
    } catch (e) { toast("无法播放音频"); }
  }
  function speak(text, audioUrl) {
    if (!text) return;
    /* 1) 优先播放本地预生成的广东话音频（发音标准，不受系统语音包影响） */
    if (audioUrl) { playLocalAudio(audioUrl); return; }
    /* 2) 无本地音频时回退系统 Web Speech（HK 粤语 voice 优先） */
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-HK";
      u.rate = 0.85;
      var v = getHkVoice();
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
      return;
    }
    /* 3) 两者皆不可用 */
    toast("当前环境不支持语音朗读，请参照粤拼练习");
  }

  /* ---------------- 渲染：词条卡 ---------------- */
  function wordCardHTML(w, opts) {
    opts = opts || {};
    var jyut = state.showJyut ? '<span class="word-jyut">' + esc(w.jyut) + "</span>" : "";
    var wordId = esc(w.id);
    var speakBtn = '<button class="btn-speak" data-speak="' + esc(w.word) + '" data-audio="assets/audio/word-' + wordId + '.mp3" type="button">🔊 讀俾你聽</button>';
    var extra = "";
    if (opts.full) {
      extra =
        '<div class="story-box">' +
        '<div class="lbl">📖 點解咁講？</div>' +
        "<p>" + esc(w.story) + "</p>" +
        "</div>";
      if (w.note) {
        extra += '<div class="word-notes">💡 ' + esc(w.note) + "</div>";
      }
    }
    return (
      '<div class="word-main">' +
      '<div class="word-emoji" aria-hidden="true">' + esc(w.emoji) + "</div>" +
      '<div class="word-text">' +
      '<div class="word-char">' + esc(w.word) + "</div>" +
      jyut +
      "</div>" +
      speakBtn +
      "</div>" +
      '<div class="word-meaning">' + esc(w.meaning) + "</div>" +
      '<div class="word-example"><span class="x">例句</span>' + esc(w.example) +
      '<button class="btn-speak btn-example" data-speak="' + esc(w.example) + '" data-audio="assets/audio/example-' + wordId + '.mp3" type="button" aria-label="朗讀例句">🔊</button>' +
      '<span class="x">' + esc(w.exampleMeaning) + "</span></div>" +
      extra
    );
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* 词库轮播状态 */
  var wordCursor = 0;
  var pronCursor = 0;

  function renderToday() {
    els.todayWordCard.innerHTML = wordCardHTML(todayWord, { full: true });
    els.todayThink.textContent = todayThink.title + "：" + todayThink.rule;
    els.todayCulture.textContent = todayCulture.title + " · " + todayCulture.period;
  }
  function renderLessonWord() {
    var w = DATA.words[wordCursor];
    els.wordIdx.textContent = (wordCursor + 1) + " / " + DATA.words.length;
    els.lessonWord.innerHTML = wordCardHTML(w, { full: true });
  }
  function renderLessonPron() {
    var p = DATA.pronunciation[pronCursor];
    els.pronIdx.textContent = (pronCursor + 1) + " / " + DATA.pronunciation.length;
    var rows = p.table.map(function (r) {
      return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td></tr>";
    }).join("");
    var audio = p.audio && p.audio.length
      ? '<div class="pron-audio">' + p.audio.map(function (a) {
          var hex = "";
          try { hex = a.codePointAt(0).toString(16); } catch (e) { hex = ""; }
          return '<button class="btn-speak" data-speak="' + esc(a) + '" data-audio="assets/audio/char-' + hex + '.mp3" type="button">🔊 ' + esc(a) + "</button>";
        }).join("") + "</div>"
      : "";
    els.lessonPron.innerHTML =
      '<h3 style="font-size:17px;font-weight:900">' + esc(p.title) + "</h3>" +
      '<p style="margin-top:8px;font-size:13.5px;color:var(--ink-dim);line-height:1.7">' + esc(p.desc) + "</p>" +
      '<table class="tone-table"><thead><tr><th>字句</th><th>讀法</th><th>參考</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<div class="tips-box"><b>貼士：</b>' + esc(p.tips) + "</div>" +
      audio;
  }
  function renderThink() {
    els.thinkList.innerHTML = DATA.thinking.map(function (t) {
      return (
        '<div class="card think-card">' +
        "<h3>" + esc(t.title) + "</h3>" +
        '<div class="d">' + esc(t.desc) + "</div>" +
        '<div class="think-example"><span class="x">例</span>' + esc(t.example) +
        '<span class="x">' + esc(t.exampleMeaning) + "</span></div>" +
        '<div class="think-rule">➤ ' + esc(t.rule) + "</div>" +
        "</div>"
      );
    }).join("");
  }
  function renderCulture() {
    els.cultureList.innerHTML = DATA.culture.map(function (c) {
      return (
        '<div class="card culture-card">' +
        '<span class="c-period">' + esc(c.period) + "</span>" +
        "<h3>" + esc(c.title) + "</h3>" +
        "<p>" + esc(c.desc) + "</p>" +
        "</div>"
      );
    }).join("");
  }

  /* ---------------- 打卡渲染 ---------------- */
  var calYear, calMonth;
  function renderCheckinView() {
    var now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    renderCalendar();
    renderStats();
  }
  function renderCalendar() {
    var weekHeads = ["一", "二", "三", "四", "五", "六", "日"];
    var html = weekHeads.map(function (w) { return '<div class="wd">' + w + "</div>"; }).join("");
    var first = new Date(calYear, calMonth, 1);
    var startOffset = (first.getDay() + 6) % 7; // 周一为行首
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var today = todayKey();

    for (var i = 0; i < startOffset; i++) html += '<div class="cal-day future"></div>';

    for (var d = 1; d <= daysInMonth; d++) {
      var key = calYear + "-" + pad(calMonth + 1) + "-" + pad(d);
      var cls = "cal-day";
      var day = new Date(calYear, calMonth, d);
      if (key > today) cls += " future";
      if (key === today) cls += " today";
      if (isChecked(key)) cls += " checked";
      html += '<div class="' + cls + '">' + d + "</div>";
    }
    els.calMonth.textContent = calYear + "年" + (calMonth + 1) + "月";
    els.calGrid.innerHTML = html;
  }
  function renderStats() {
    var streak = calcStreak();
    var month = monthCount(calYear, calMonth);
    els.calTotal.textContent = state.checkins.length + "天";
    els.calStreak.textContent = streak + "天";
    els.calGoal.textContent = month + " / " + state.goal;
    var left = state.goal - month;
    if (left > 0) {
      els.streakTip.textContent =
        "🏮 本月已打卡 " + month + " 天，距離目標（" + state.goal + " 天）仲差 " + left + " 天。連續打卡 " + streak + " 日，戒唔甩㗎！";
    } else {
      els.streakTip.textContent = "🎉 本月目標已達成！連續打卡 " + streak + " 日。叻仔叻女！";
    }
  }

  /* ---------------- 主打卡渲染 ---------------- */
  function renderHero() {
    var checked = todayChecked();
    var streak = calcStreak();
    var total = state.checkins.length;
    var month = monthCount(new Date().getFullYear(), new Date().getMonth());

    els.ringNum.textContent = streak;
    var r = 36, c = 2 * Math.PI * r;
    var pct = Math.min(streak / 7, 1); // 7天一个霓虹周期
    els.ringFg.style.strokeDashoffset = Math.round(c * (1 - pct));
    els.checkinRing.classList.toggle("done", checked);
    els.btnCheckin.textContent = checked ? "已打卡 ✓" : "打卡";
    els.btnCheckin.classList.toggle("done", checked);
    els.checkedBanner.classList.toggle("show", checked);
    els.checkinHi.textContent = checked
      ? "今日已達標，好嘢！"
      : "今日學咗未？打卡先！";
    els.statTotal.textContent = total;
    els.statStreak.textContent = streak;
    els.statMonth.textContent = month;
  }

  function doCheckin() {
    if (todayChecked()) {
      toast("今日已經打卡啦，聽日再嚟！");
      return;
    }
    state.checkins.push(todayKey());
    state.total += 1;
    saveState();
    renderHero();
    renderStats();
    renderCalendar();
    toast("✅ 打卡成功！學多咗一句地道粵語");
  }

  /* ---------------- 视图切换 ---------------- */
  var views = ["home", "learn", "checkin", "mine"];
  function switchView(name) {
    views.forEach(function (v) {
      var view = $("view-" + v);
      var tab = document.querySelector('.tab-item[data-view="' + v + '"]');
      if (v === name) {
        view.classList.add("active");
        tab.classList.add("active");
      } else {
        view.classList.remove("active");
        tab.classList.remove("active");
      }
    });
    if (name === "checkin") { renderCheckinView(); }
    window.scrollTo(0, 0);
  }

  /* ---------------- 学习模块 tab ---------------- */
  function switchLearnTab(name) {
    var tabs = ["word", "pron", "think", "culture"];
    tabs.forEach(function (t) {
      var btn = document.querySelector('.seg button[data-learn-tab="' + t + '"]');
      var panel = $("learn-" + t);
      if (t === name) {
        btn.classList.add("active");
        panel.hidden = false;
      } else {
        btn.classList.remove("active");
        panel.hidden = true;
      }
    });
  }

  /* ---------------- 设置 ---------------- */
  function renderSettings() {
    els.goalChips.innerHTML = [7, 14, 21, 28, 31].map(function (g) {
      return '<button class="chip' + (state.goal === g ? " active" : "") + '" data-goal="' + g + '" type="button">' + g + " 天</button>";
    }).join("");
    els.swAutoSpeak.classList.toggle("on", state.autoSpeak);
    els.swShowJyut.classList.toggle("on", state.showJyut);
    els.swAutoSpeak.setAttribute("aria-checked", state.autoSpeak ? "true" : "false");
    els.swShowJyut.setAttribute("aria-checked", state.showJyut ? "true" : "false");
    els.dataInfo.textContent = state.checkins.length + " 天記錄 · " + (storageOk ? "本機保存" : "僅內存");
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    els.btnCheckin.addEventListener("click", doCheckin);

    document.querySelectorAll(".tab-item").forEach(function (tab) {
      tab.addEventListener("click", function () { switchView(tab.getAttribute("data-view")); });
    });
    document.querySelectorAll(".seg button").forEach(function (btn) {
      btn.addEventListener("click", function () { switchLearnTab(btn.getAttribute("data-learn-tab")); });
    });

    els.wordPrev.addEventListener("click", function () {
      wordCursor = (wordCursor - 1 + DATA.words.length) % DATA.words.length;
      renderLessonWord();
    });
    els.wordNext.addEventListener("click", function () {
      wordCursor = (wordCursor + 1) % DATA.words.length;
      renderLessonWord();
    });
    els.pronPrev.addEventListener("click", function () {
      pronCursor = (pronCursor - 1 + DATA.pronunciation.length) % DATA.pronunciation.length;
      renderLessonPron();
    });
    els.pronNext.addEventListener("click", function () {
      pronCursor = (pronCursor + 1) % DATA.pronunciation.length;
      renderLessonPron();
    });

    els.calPrev.addEventListener("click", function () {
      calMonth -= 1;
      if (calMonth < 0) { calMonth = 11; calYear -= 1; }
      renderCalendar();
      renderStats();
    });
    els.calNext.addEventListener("click", function () {
      calMonth += 1;
      if (calMonth > 11) { calMonth = 0; calYear += 1; }
      renderCalendar();
      renderStats();
    });

    /* 事件委托：朗读 */
    document.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== document && !t.hasAttribute) t = t.parentNode;
      if (!t) return;
      if (t.hasAttribute && t.hasAttribute("data-speak")) {
        speak(t.getAttribute("data-speak"), t.getAttribute("data-audio"));
      } else if (t.id === "goTodayWord") {
        switchView("learn");
        switchLearnTab("word");
        wordCursor = DATA.words.indexOf(todayWord);
        renderLessonWord();
      } else if (t.id === "goTodayThink") {
        switchView("learn");
        switchLearnTab("think");
      } else if (t.id === "goTodayCulture") {
        switchView("learn");
        switchLearnTab("culture");
      }
    });

    /* 目标 chips */
    els.goalChips.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      state.goal = parseInt(chip.getAttribute("data-goal"), 10);
      saveState();
      renderSettings();
      renderStats();
      toast("月度目標設為 " + state.goal + " 天");
    });

    /* 开关 */
    els.swAutoSpeak.addEventListener("click", function () {
      state.autoSpeak = !state.autoSpeak;
      saveState();
      renderSettings();
    });
    els.swShowJyut.addEventListener("click", function () {
      state.showJyut = !state.showJyut;
      saveState();
      renderSettings();
      renderToday();
      renderLessonWord();
    });
    [els.swAutoSpeak, els.swShowJyut].forEach(function (sw) {
      sw.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sw.click(); }
      });
    });

    /* 重置（二次确认：第一次点击进入待确认，2.5 秒内再点才执行） */
    var resetArmed = false, resetTimer = null;
    els.btnReset.addEventListener("click", function () {
      if (!resetArmed) {
        resetArmed = true;
        els.btnReset.textContent = "再按一次確認清空";
        toast("再按一次「清空」以確認");
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(function () {
          resetArmed = false;
          els.btnReset.textContent = "清空所有打卡記錄";
        }, 2500);
        return;
      }
      resetArmed = false;
      if (resetTimer) clearTimeout(resetTimer);
      els.btnReset.textContent = "清空所有打卡記錄";
      state.checkins = [];
      state.total = 0;
      saveState();
      renderHero();
      renderCheckinView();
      renderSettings();
      toast("已清空記錄");
    });
  }

  /* ---------------- 自动朗读今日词条 ---------------- */
  function maybeAutoSpeak() {
    if (state.autoSpeak && !todayChecked() && "speechSynthesis" in window) {
      // 若用户未打卡，自动朗读今日词条一次（仅一次）
      setTimeout(function () {
        if (!document.hidden) speak(todayWord.word, "assets/audio/word-" + todayWord.id + ".mp3");
      }, 600);
    }
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    loadState();
    els.dateChip.textContent = fmtDate(new Date());
    renderToday();
    renderLessonWord();
    renderLessonPron();
    renderThink();
    renderCulture();
    renderHero();
    renderCalendar();
    renderStats();
    renderSettings();
    bindEvents();

    /* PWA 注册（仅 HTTPS/localhost 环境生效，失败无碍） */
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () { /* 离线可用为增强，不阻断 */ });
      });
    }
    /* 语音列表异步加载 */
    if ("speechSynthesis" in window && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = function () { getHkVoice(); };
      if (window.speechSynthesis.getVoices().length) getHkVoice();
    }
    maybeAutoSpeak();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();