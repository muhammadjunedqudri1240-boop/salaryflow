/* ==========================================================================
   SalaryFlow — app.js
   Vanilla JS. No frameworks, no build step, no backend, no AI.
   All state lives in localStorage under STORAGE_KEY.
   ========================================================================== */

(function () {
  "use strict";

  /* ----------------------------- Constants ----------------------------- */

  var STORAGE_KEY = "salaryflow_data_v1";

  var CURRENCIES = {
    INR: { symbol: "₹", name: "Indian Rupee" },
    USD: { symbol: "$", name: "US Dollar" },
    EUR: { symbol: "€", name: "Euro" },
    GBP: { symbol: "£", name: "British Pound" },
    AED: { symbol: "د.إ", name: "UAE Dirham" },
    SAR: { symbol: "﷼", name: "Saudi Riyal" }
  };

  var DEFAULT_CATEGORIES = [
    { id: "food", name: "Food", icon: "🍔", color: "#FF6B5E" },
    { id: "transport", name: "Transport", icon: "🚌", color: "#4C8DFF" },
    { id: "shopping", name: "Shopping", icon: "🛍️", color: "#F2A93B" },
    { id: "bills", name: "Bills", icon: "🧾", color: "#8B6BFF" },
    { id: "rent", name: "Rent", icon: "🏠", color: "#0F8B8D" },
    { id: "health", name: "Health", icon: "💊", color: "#E4574A" },
    { id: "education", name: "Education", icon: "📚", color: "#2F9E6E" },
    { id: "entertainment", name: "Entertainment", icon: "🎬", color: "#D65DB1" },
    { id: "family", name: "Family", icon: "👪", color: "#FF9F5A" },
    { id: "mobile", name: "Mobile/Internet", icon: "📶", color: "#4CB0C9" },
    { id: "other", name: "Other", icon: "✨", color: "#8A94A3" }
  ];

  var DAY_MS = 24 * 60 * 60 * 1000;

  /* ------------------------------- State -------------------------------- */

  var state = null; // loaded from storage or created fresh
  var ui = {
    activeNav: "home",
    filter: "all",
    filterCategory: "",
    sort: "newest",
    search: "",
    editingExpenseId: null,
    confirmCallback: null,
    theme: "light",
    pendingExpensePhoto: "",
    pendingExpensePhotoName: "",
    removeExpensePhoto: false
  };

  /* ----------------------------- Utilities ------------------------------- */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    var d = new Date();
    return toISODate(d);
  }

  function toISODate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  // Parse an ISO date string (YYYY-MM-DD) as a local midnight Date, avoiding
  // timezone shifting issues that plain `new Date(str)` can introduce.
  function parseISODate(str) {
    if (!str) return null;
    var parts = str.split("-");
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m - 1, d);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysBetween(a, b) {
    // Whole days between two Date objects, using local midnight to avoid DST issues.
    var A = startOfDay(a).getTime();
    var B = startOfDay(b).getTime();
    return Math.round((B - A) / DAY_MS);
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function safeNumber(n, fallback) {
    if (typeof n !== "number" || isNaN(n) || !isFinite(n)) return fallback === undefined ? 0 : fallback;
    return n;
  }

  function currencySymbol() {
    var code = state && state.settings.currency ? state.settings.currency : "INR";
    return (CURRENCIES[code] || CURRENCIES.INR).symbol;
  }

  function formatMoney(amount) {
    var n = safeNumber(amount, 0);
    var negative = n < 0;
    var abs = Math.abs(n);
    var rounded = Math.round(abs * 100) / 100;
    var str = rounded.toLocaleString(undefined, { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
    return (negative ? "-" : "") + currencySymbol() + str;
  }

  function formatDate(iso) {
    var d = parseISODate(iso);
    if (!d) return "";
    var fmt = (state && state.settings.dateFormat) || "d-mmm";
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yyyy = d.getFullYear();
    if (fmt === "dd-mm-yyyy") return dd + "-" + mm + "-" + yyyy;
    if (fmt === "mm-dd-yyyy") return mm + "-" + dd + "-" + yyyy;
    return d.getDate() + " " + months[d.getMonth()];
  }

  function formatDateFriendly(iso) {
    var d = parseISODate(iso);
    if (!d) return "";
    var t = startOfDay(new Date());
    var diff = daysBetween(t, startOfDay(d));
    if (diff === 0) return "Today";
    if (diff === -1) return "Yesterday";
    return formatDate(iso);
  }

  function escapeHTML(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* --------------------------- Persistence -------------------------------- */

  function defaultState() {
    return {
      onboarded: false,
      salary: { amount: 0, startDate: todayISO(), nextDate: todayISO() },
      settings: { currency: "INR", theme: "dark", dateFormat: "d-mmm" },
      categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
      expenses: []
    };
  }

  function loadState() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) return defaultState();
    try {
      var parsed = JSON.parse(raw);
      return sanitizeState(parsed);
    } catch (e) {
      console.error("SalaryFlow: corrupted data, resetting.", e);
      return defaultState();
    }
  }

  // Merge parsed data over a fresh default so missing fields never crash the app.
  function sanitizeState(parsed) {
    var base = defaultState();
    if (!parsed || typeof parsed !== "object") return base;

    var out = base;
    out.onboarded = !!parsed.onboarded;

    if (parsed.salary && typeof parsed.salary === "object") {
      out.salary.amount = safeNumber(parseFloat(parsed.salary.amount), 0);
      if (out.salary.amount < 0) out.salary.amount = 0;
      out.salary.startDate = typeof parsed.salary.startDate === "string" ? parsed.salary.startDate : base.salary.startDate;
      out.salary.nextDate = typeof parsed.salary.nextDate === "string" ? parsed.salary.nextDate : base.salary.nextDate;
    }

    if (parsed.settings && typeof parsed.settings === "object") {
      out.settings.currency = CURRENCIES[parsed.settings.currency] ? parsed.settings.currency : "INR";
      out.settings.theme = ["light", "dark", "system"].indexOf(parsed.settings.theme) !== -1 ? parsed.settings.theme : "light";
      out.settings.dateFormat = ["d-mmm", "dd-mm-yyyy", "mm-dd-yyyy"].indexOf(parsed.settings.dateFormat) !== -1 ? parsed.settings.dateFormat : "d-mmm";
    }

    if (Array.isArray(parsed.categories) && parsed.categories.length) {
      out.categories = parsed.categories
        .filter(function (c) { return c && typeof c === "object" && c.id && c.name; })
        .map(function (c) {
          return { id: String(c.id), name: String(c.name), icon: c.icon || "✨", color: c.color || "#8A94A3" };
        });
      if (!out.categories.length) out.categories = base.categories;
    }

    if (Array.isArray(parsed.expenses)) {
      var catIds = out.categories.map(function (c) { return c.id; });
      out.expenses = parsed.expenses
        .filter(function (e) { return e && typeof e === "object"; })
        .map(function (e) {
          var amount = safeNumber(parseFloat(e.amount), 0);
          if (amount < 0) amount = 0;
          return {
              id: e.id || uid(),
              amount: amount,
              category: catIds.indexOf(e.category) !== -1 ? e.category : "other",
              date: typeof e.date === "string" ? e.date : todayISO(),
              note: typeof e.note === "string" ? e.note.slice(0, 200) : "",
              photo: typeof e.photo === "string" && e.photo.indexOf("data:image/") === 0 ? e.photo : "",
              photoName: typeof e.photoName === "string" ? e.photoName.slice(0, 120) : "",
              cycleKey: typeof e.cycleKey === "string" ? e.cycleKey : ""
            };
        });
    }

    return out;
  }

  var saveTimer = null;
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("SalaryFlow: could not save data.", e);
      toast("Couldn't save — your device storage may be full.");
    }
  }

  /* ----------------------------- Calculations ----------------------------- */

  function getSalaryCycleKey() {
    return String(state.salary.startDate || "") + "|" + String(state.salary.nextDate || "");
  }

  function getCycleExpenses() {
    var start = parseISODate(state.salary.startDate);
    var end = parseISODate(state.salary.nextDate);
    var cycleKey = getSalaryCycleKey();

    if (!start || !end) return state.expenses.slice();

    return state.expenses.filter(function (e) {
      // Expenses entered during the current salary cycle are always counted
      // toward that cycle, even if the user selected a different expense date.
      if (e.cycleKey && e.cycleKey === cycleKey) return true;

      // Older saved expenses without cycleKey remain date-based.
      var d = parseISODate(e.date);
      if (!d) return false;
      return d >= startOfDay(start) && d <= startOfDay(end);
    });
  }

  function computeCycle() {
    var salary = safeNumber(state.salary.amount, 0);
    var start = parseISODate(state.salary.startDate) || startOfDay(new Date());
    var end = parseISODate(state.salary.nextDate) || startOfDay(new Date());
    var today = startOfDay(new Date());

    var cycleExpenses = getCycleExpenses();
    var spent = cycleExpenses.reduce(function (sum, e) { return sum + safeNumber(e.amount, 0); }, 0);
    var remaining = salary - spent;

    var totalDays = Math.max(1, daysBetween(start, end));
    var daysPassedRaw = daysBetween(start, today);
    var daysPassed = clamp(daysPassedRaw, 0, totalDays);

    // Days remaining until next salary, counting today if there's still time left.
    var daysRemainingRaw = daysBetween(today, end);
    var daysRemaining = clamp(daysRemainingRaw, 0, totalDays);
    var safeDivisorDays = Math.max(1, daysRemaining);

    var dailyLimit = remaining > 0 ? remaining / safeDivisorDays : 0;
    dailyLimit = safeNumber(dailyLimit, 0);

    var percentSpent = salary > 0 ? clamp((spent / salary) * 100, 0, 999) : (spent > 0 ? 100 : 0);
    var avgDailySpend = daysPassed > 0 ? spent / daysPassed : spent;

    var isOverspent = spent > salary;
    var cycleEnded = daysRemainingRaw <= 0;
    var cycleNotStarted = daysBetween(today, start) > 0;

    return {
      salary: salary, spent: spent, remaining: remaining,
      totalDays: totalDays, daysPassed: daysPassed, daysRemaining: daysRemaining,
      dailyLimit: dailyLimit, percentSpent: percentSpent, avgDailySpend: avgDailySpend,
      isOverspent: isOverspent, cycleEnded: cycleEnded, cycleNotStarted: cycleNotStarted,
      start: start, end: end
    };
  }

  function spendingStatusMessage(cycle) {
    if (cycle.isOverspent) {
      return { tone: "danger", text: "Your expenses have gone past this salary cycle's budget. Consider pausing non-essential spending." };
    }
    if (cycle.cycleEnded) {
      return { tone: "neutral", text: "This salary cycle has ended. Update your salary dates in Settings to start a new one." };
    }
    if (cycle.salary <= 0) {
      return { tone: "neutral", text: "Add your salary amount in Settings to see your daily safe-spend limit." };
    }
    var ratio = cycle.avgDailySpend > 0 && cycle.dailyLimit > 0 ? cycle.avgDailySpend / (cycle.dailyLimit + cycle.avgDailySpend === 0 ? 1 : 1) : 0;
    // Compare average spend so far vs a fair daily share of the whole salary.
    var fairShare = cycle.totalDays > 0 ? cycle.salary / cycle.totalDays : cycle.salary;
    if (cycle.daysPassed === 0) {
      return { tone: "good", text: "You're just getting started on this cycle. Spend mindfully today." };
    }
    if (cycle.avgDailySpend <= fairShare * 1.05) {
      return { tone: "good", text: "You're doing well. Your spending is currently within your available budget." };
    }
    if (cycle.avgDailySpend <= fairShare * 1.25) {
      return { tone: "warn", text: "Your spending is a little higher than your daily target." };
    }
    return { tone: "danger", text: "Consider reducing daily spending to make your balance last until payday." };
  }

  /* -------------------------------- Toasts --------------------------------- */

  function toast(message) {
    var container = document.getElementById("toast-container");
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity 0.25s ease";
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 250);
    }, 2200);
  }

  /* ------------------------------ Confirm dialog ---------------------------- */

  function showConfirm(title, message, onConfirm, opts) {
    var overlay = document.getElementById("modal-confirm");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    var okBtn = document.getElementById("confirm-ok");
    okBtn.textContent = (opts && opts.okLabel) || "Confirm";
    ui.confirmCallback = onConfirm;
    overlay.hidden = false;
  }

  function hideConfirm() {
    document.getElementById("modal-confirm").hidden = true;
    ui.confirmCallback = null;
  }

  /* --------------------------------- Theme ---------------------------------- */

  function applyTheme() {
    var pref = state.settings.theme || "light";
    var effective = pref;
    if (pref === "system") {
      effective = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", effective);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", effective === "dark" ? "#10151C" : "#0F8B8D");
    updateSegmented();
  }

  function updateSegmented() {
    var buttons = document.querySelectorAll("#settings-theme-segmented .seg-btn");
    buttons.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-theme") === state.settings.theme);
    });
  }

  function toggleThemeQuick() {
    var current = document.documentElement.getAttribute("data-theme");
    state.settings.theme = current === "dark" ? "light" : "dark";
    persist();
    applyTheme();
  }

  /* ------------------------------- Navigation -------------------------------- */

  function navigate(view) {
    ui.activeNav = view;
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = true; });
    var target = document.getElementById("view-" + view);
    if (target) target.hidden = false;
    document.querySelectorAll(".nav-item").forEach(function (n) {
      n.classList.toggle("active", n.getAttribute("data-nav") === view);
    });
    document.getElementById("content").scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "auto" });
    if (view === "expenses") renderExpensesView();
    if (view === "reports") renderReports();
    if (view === "settings") renderSettings();
    if (view === "home") renderHome();
  }

  /* --------------------------------- Setup ----------------------------------- */

  function populateCurrencySelect(selectEl, selected) {
    selectEl.innerHTML = "";
    Object.keys(CURRENCIES).forEach(function (code) {
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code + " (" + CURRENCIES[code].symbol + ") — " + CURRENCIES[code].name;
      if (code === selected) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function initSetupScreen() {
    var today = todayISO();
    var next = toISODate(new Date(Date.now() + 30 * DAY_MS));
    document.getElementById("input-salary-date").value = today;
    document.getElementById("input-next-date").value = next;
    populateCurrencySelect(document.getElementById("input-currency"), "INR");
    document.getElementById("input-currency").addEventListener("change", function (e) {
      document.getElementById("setup-currency-symbol").textContent = CURRENCIES[e.target.value].symbol;
    });

    document.getElementById("form-setup").addEventListener("submit", function (e) {
      e.preventDefault();
      clearSetupErrors();

      var salary = parseFloat(document.getElementById("input-salary").value);
      var salaryDate = document.getElementById("input-salary-date").value;
      var nextDate = document.getElementById("input-next-date").value;
      var currency = document.getElementById("input-currency").value;

      var hasError = false;
      if (isNaN(salary) || salary <= 0) {
        setFieldError("err-salary", "Enter a salary amount greater than 0.");
        hasError = true;
      }
      if (!salaryDate) {
        setFieldError("err-salary-date", "Please pick your salary date.");
        hasError = true;
      }
      if (!nextDate) {
        setFieldError("err-next-date", "Please pick your next salary date.");
        hasError = true;
      }
      if (salaryDate && nextDate && parseISODate(nextDate) <= parseISODate(salaryDate)) {
        setFieldError("err-next-date", "Next salary date must be after the salary date.");
        hasError = true;
      }
      if (hasError) return;

      state.salary.amount = salary;
      state.salary.startDate = salaryDate;
      state.salary.nextDate = nextDate;
      state.settings.currency = currency;
      state.onboarded = true;
      persist();

      toast("Welcome! Your salary cycle is set up.");
      showMainApp();
    });
  }

  function clearSetupErrors() {
    ["err-salary", "err-salary-date", "err-next-date"].forEach(function (id) {
      document.getElementById(id).textContent = "";
    });
  }
  function setFieldError(id, msg) {
    document.getElementById(id).textContent = msg;
  }

  function showMainApp() {
    document.getElementById("screen-setup").hidden = true;
    document.getElementById("screen-main").hidden = false;
    navigate("home");
    renderAll();
  }

  /* --------------------------------- Home view -------------------------------- */

  function greetingCopy() {
    var h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Good night";
  }

  function renderHome() {
    var cycle = computeCycle();

    document.getElementById("greeting-text").textContent = greetingCopy();
    document.getElementById("greeting-sub-text").textContent = cycle.isOverspent
      ? "You're a bit over budget this cycle."
      : "Here's where things stand today.";

    document.getElementById("hero-remaining").textContent = formatMoney(Math.max(cycle.remaining, cycle.isOverspent ? cycle.remaining : cycle.remaining));
    document.getElementById("hero-salary").textContent = formatMoney(cycle.salary);
    document.getElementById("hero-spent").textContent = formatMoney(cycle.spent);
    document.getElementById("hero-overspend").hidden = !cycle.isOverspent;

    // Gauge
    var circumference = 2 * Math.PI * 68; // ~427.26
    var gaugeFill = document.getElementById("gauge-fill");
    var fairShare = cycle.totalDays > 0 ? cycle.salary / cycle.totalDays : 0;
    var gaugeRatio = fairShare > 0 ? clamp(cycle.dailyLimit / (fairShare * 1.6), 0, 1) : (cycle.dailyLimit > 0 ? 1 : 0);
    gaugeFill.style.strokeDasharray = String(circumference);
    gaugeFill.style.strokeDashoffset = String(circumference * (1 - gaugeRatio));

    var status = spendingStatusMessage(cycle);
    var gaugeColorMap = { good: "var(--primary)", warn: "var(--yellow)", danger: "var(--coral)", neutral: "var(--ink-faint)" };
    gaugeFill.style.stroke = gaugeColorMap[status.tone] || "var(--primary)";

    document.getElementById("gauge-amount").textContent = cycle.isOverspent ? formatMoney(0) : formatMoney(cycle.dailyLimit);
    document.getElementById("gauge-status").textContent = cycle.cycleEnded ? "cycle ended" : "per day";
    document.getElementById("gauge-message").textContent = status.text;

    document.getElementById("days-left-value").textContent = cycle.cycleEnded ? "0" : String(cycle.daysRemaining);
    document.getElementById("days-left-sub").textContent = "until " + formatDate(state.salary.nextDate);

    var pct = Math.round(cycle.percentSpent);
    document.getElementById("percent-spent-value").textContent = pct + "%";
    document.getElementById("percent-spent-sub").textContent = "of your salary";

    document.getElementById("progress-percent").textContent = Math.min(pct, 999) + "%";
    var fillEl = document.getElementById("progress-bar-fill");
    fillEl.style.width = clamp(pct, 0, 100) + "%";
    fillEl.style.background = pct > 100
      ? "var(--danger)"
      : pct > 85
        ? "linear-gradient(90deg, var(--yellow), var(--coral))"
        : "linear-gradient(90deg, var(--primary), var(--coral))";

    // Recent expenses (latest 5, most recent first)
    var recent = state.expenses.slice().sort(sortByDateDesc).slice(0, 5);
    renderExpenseList(document.getElementById("recent-expenses-list"), recent);
    var recentEmpty = document.getElementById("recent-empty");
    if (!recent.length) {
      recentEmpty.hidden = false;
      recentEmpty.innerHTML = emptyStateHTML("No expenses yet", "Start tracking your spending by adding your first expense.", true);
      document.getElementById("recent-expenses-list").hidden = true;
    } else {
      recentEmpty.hidden = true;
      document.getElementById("recent-expenses-list").hidden = false;
    }
  }

  function emptyStateHTML(title, sub, showButton) {
    return (
      '<div class="empty-state-icon">' +
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      "</div>" +
      "<h3>" + escapeHTML(title) + "</h3>" +
      "<p>" + escapeHTML(sub) + "</p>" +
      (showButton ? '<button class="btn btn-primary" id="btn-empty-add">Add expense</button>' : "")
    );
  }

  function sortByDateDesc(a, b) {
    if (a.date === b.date) return 0;
    return a.date > b.date ? -1 : 1;
  }

  function categoryById(id) {
    return state.categories.find(function (c) { return c.id === id; }) || { name: "Other", icon: "✨", color: "#8A94A3" };
  }

  function expensePhotoMarkup(e) {
    if (!e.photo) return '<div class="expense-photo-placeholder"><span>' + escapeHTML(categoryById(e.category).icon) + '</span><small>No photo</small></div>';
    return '<div class="expense-photo-large" title="Expense photo"><img src="' + escapeHTML(e.photo) + '" alt="Attached expense photo" loading="lazy" /></div>';
  }

  function expenseActionMarkup(e) {
    return (
      '<div class="expense-actions">' +
        '<button type="button" class="edit-action" data-id="' + e.id + '" aria-label="Edit expense">' +
          '<span class="action-icon" aria-hidden="true">✎</span><span>Edit</span>' +
        '</button>' +
        '<button type="button" class="danger-action" data-id="' + e.id + '" aria-label="Delete expense">' +
          '<span class="action-icon" aria-hidden="true">⌫</span><span>Delete</span>' +
        '</button>' +
      '</div>'
    );
  }

  function expenseProductCard(e, withActions) {
    var cat = categoryById(e.category);
    return (
      '<article class="expense-item expense-product-card" data-id="' + e.id + '">' +
        expensePhotoMarkup(e) +
        '<div class="expense-product-body">' +
          '<div class="expense-product-top">' +
            '<div class="expense-product-category">' +
              '<span class="expense-icon" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.icon + '</span>' +
              '<div><div class="expense-cat">' + escapeHTML(cat.name) + '</div><div class="expense-date">' + formatDateFriendly(e.date) + '</div></div>' +
            '</div>' +
            '<div class="expense-amount">-' + formatMoney(e.amount) + '</div>' +
          '</div>' +
          (e.note ? '<div class="expense-detail"><span class="detail-label">Details</span><span class="detail-value">' + escapeHTML(e.note) + '</span></div>' : '') +
          (withActions ? expenseActionMarkup(e) : '') +
        '</div>' +
      '</article>'
    );
  }

  function renderExpenseList(container, list) {
    container.innerHTML = list.map(function (e) { return expenseProductCard(e, false); }).join("");

    container.querySelectorAll(".expense-item").forEach(function (item) {
      item.addEventListener("click", function () {
        openExpenseModal(item.getAttribute("data-id"));
      });
    });
  }

  /* ------------------------------ Expenses view -------------------------------- */

  function getFilteredSortedExpenses() {
    var list = state.expenses.slice();
    var today = startOfDay(new Date());

    if (ui.filter === "today") {
      list = list.filter(function (e) { return e.date === todayISO(); });
    } else if (ui.filter === "week") {
      var weekAgo = new Date(today.getTime() - 6 * DAY_MS);
      list = list.filter(function (e) {
        var d = parseISODate(e.date);
        return d && d >= weekAgo && d <= today;
      });
    } else if (ui.filter === "month") {
      list = list.filter(function (e) {
        var d = parseISODate(e.date);
        return d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
      });
    }

    if (ui.filterCategory) {
      list = list.filter(function (e) { return e.category === ui.filterCategory; });
    }

    if (ui.search.trim()) {
      var q = ui.search.trim().toLowerCase();
      list = list.filter(function (e) {
        var cat = categoryById(e.category);
        return (
          cat.name.toLowerCase().indexOf(q) !== -1 ||
          (e.note || "").toLowerCase().indexOf(q) !== -1 ||
          String(e.amount).indexOf(q) !== -1
        );
      });
    }

    list.sort(function (a, b) {
      if (ui.sort === "newest") return a.date === b.date ? 0 : (a.date > b.date ? -1 : 1);
      if (ui.sort === "oldest") return a.date === b.date ? 0 : (a.date < b.date ? -1 : 1);
      if (ui.sort === "highest") return b.amount - a.amount;
      if (ui.sort === "lowest") return a.amount - b.amount;
      return 0;
    });

    return list;
  }

  function renderExpensesView() {
    var listEl = document.getElementById("all-expenses-list");
    var emptyEl = document.getElementById("all-empty");
    var filtered = getFilteredSortedExpenses();

    renderExpenseListWithActions(listEl, filtered);

    if (!filtered.length) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      var hasAnyExpenses = state.expenses.length > 0;
      emptyEl.innerHTML = hasAnyExpenses
        ? emptyStateHTML("No matching expenses", "Try a different search term or filter.", false)
        : emptyStateHTML("No expenses yet", "Start tracking your spending by adding your first expense.", true);
    } else {
      emptyEl.hidden = true;
      listEl.hidden = false;
    }
  }

  function renderExpenseListWithActions(container, list) {
    container.innerHTML = list.map(function (e) { return expenseProductCard(e, true); }).join("");

    container.querySelectorAll(".edit-action").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openExpenseModal(btn.getAttribute("data-id"));
      });
    });
    container.querySelectorAll(".danger-action").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var id = btn.getAttribute("data-id");
        showConfirm("Delete this expense?", "This will permanently remove this expense from your records.", function () {
          deleteExpense(id);
        }, { okLabel: "Delete" });
      });
    });
    container.querySelectorAll(".expense-item").forEach(function (item) {
      item.addEventListener("click", function () {
        openExpenseModal(item.getAttribute("data-id"));
      });
    });
  }

  function populateCategoryFilterSelect() {
    var sel = document.getElementById("select-category-filter");
    var current = sel.value;
    sel.innerHTML = '<option value="">Category</option>' + state.categories.map(function (c) {
      return '<option value="' + c.id + '">' + escapeHTML(c.icon) + " " + escapeHTML(c.name) + "</option>";
    }).join("");
    if (current) sel.value = current;
  }

  function initExpensesViewEvents() {
    document.getElementById("input-search").addEventListener("input", function (e) {
      ui.search = e.target.value;
      renderExpensesView();
    });
    document.getElementById("select-sort").addEventListener("change", function (e) {
      ui.sort = e.target.value;
      renderExpensesView();
    });
    document.getElementById("select-category-filter").addEventListener("change", function (e) {
      ui.filterCategory = e.target.value;
      renderExpensesView();
    });
    document.querySelectorAll(".filter-chip[data-filter]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll(".filter-chip[data-filter]").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        ui.filter = chip.getAttribute("data-filter");
        renderExpensesView();
      });
    });
  }

  /* -------------------------------- Reports view -------------------------------- */

  function renderReports() {
    var cycle = computeCycle();
    document.getElementById("rep-total").textContent = formatMoney(cycle.spent);
    document.getElementById("rep-avg").textContent = formatMoney(cycle.avgDailySpend);
    document.getElementById("rep-avg-sub").textContent = cycle.daysPassed > 0 ? "over " + cycle.daysPassed + " day" + (cycle.daysPassed === 1 ? "" : "s") + " so far" : "per day so far";

    var cycleExpenses = getCycleExpenses();
    var byCategory = {};
    cycleExpenses.forEach(function (e) {
      byCategory[e.category] = (byCategory[e.category] || 0) + safeNumber(e.amount, 0);
    });
    var catEntries = Object.keys(byCategory).map(function (id) {
      return { cat: categoryById(id), amount: byCategory[id] };
    }).sort(function (a, b) { return b.amount - a.amount; });

    var topEl = document.getElementById("rep-top-category");
    if (catEntries.length) {
      var top = catEntries[0];
      topEl.innerHTML =
        '<div class="tc-name"><span>' + top.cat.icon + "</span>" + escapeHTML(top.cat.name) + "</div>" +
        '<div class="tc-amount">' + formatMoney(top.amount) + "</div>";
    } else {
      topEl.innerHTML = '<p style="color:var(--ink-soft);font-size:13.5px;">No expenses recorded in this cycle yet.</p>';
    }

    var breakdownEl = document.getElementById("rep-category-breakdown");
    if (catEntries.length) {
      breakdownEl.innerHTML = catEntries.map(function (entry) {
        var pct = cycle.spent > 0 ? Math.round((entry.amount / cycle.spent) * 100) : 0;
        return (
          '<div class="cat-breakdown-row">' +
            '<div class="cat-breakdown-head"><span class="cb-name"><span>' + entry.cat.icon + "</span>" + escapeHTML(entry.cat.name) + "</span><span>" + formatMoney(entry.amount) + " · " + pct + "%</span></div>" +
            '<div class="cat-breakdown-track"><div class="cat-breakdown-fill" style="width:' + pct + "%;background:" + entry.cat.color + ';"></div></div>' +
          "</div>"
        );
      }).join("");
    } else {
      breakdownEl.innerHTML = '<p style="color:var(--ink-soft);font-size:13.5px;">Nothing to show yet — add an expense to see your breakdown.</p>';
    }

    var cycleEl = document.getElementById("rep-cycle");
    cycleEl.innerHTML = [
      ["Cycle", formatDate(state.salary.startDate) + " → " + formatDate(state.salary.nextDate)],
      ["Salary", formatMoney(cycle.salary)],
      ["Spent", formatMoney(cycle.spent)],
      ["Remaining", formatMoney(cycle.remaining)],
      ["Days passed", String(cycle.daysPassed)],
      ["Days remaining", String(cycle.daysRemaining)],
      ["Average daily spend", formatMoney(cycle.avgDailySpend)],
      ["Safe daily limit", cycle.isOverspent ? formatMoney(0) : formatMoney(cycle.dailyLimit)]
    ].map(function (row) {
      return '<div class="cycle-row"><span class="cr-label">' + row[0] + '</span><span class="cr-value">' + row[1] + "</span></div>";
    }).join("");
  }

  /* -------------------------------- Settings view -------------------------------- */

  function renderSettings() {
    populateCurrencySelect(document.getElementById("settings-currency"), state.settings.currency);
    document.getElementById("settings-date-format").value = state.settings.dateFormat;
    document.getElementById("settings-salary").value = state.salary.amount || "";
    document.getElementById("settings-salary-date").value = state.salary.startDate;
    document.getElementById("settings-next-date").value = state.salary.nextDate;
    updateSegmented();
    renderCategoryManageList();
  }

  function renderCategoryManageList() {
    var el = document.getElementById("category-manage-list");
    var usage = {};
    state.expenses.forEach(function (e) { usage[e.category] = (usage[e.category] || 0) + 1; });

    el.innerHTML = state.categories.map(function (c) {
      var count = usage[c.id] || 0;
      return (
        '<div class="category-manage-item" data-id="' + c.id + '">' +
          '<span class="cat-name"><span>' + c.icon + "</span>" + escapeHTML(c.name) + (count ? '<span style="color:var(--ink-faint);font-weight:400;font-size:12px;">(' + count + ")</span>" : "") + "</span>" +
          '<span class="cat-actions">' +
            '<button class="rename-cat" data-id="' + c.id + '">Rename</button>' +
            '<button class="delete-cat" data-id="' + c.id + '">Delete</button>' +
          "</span>" +
        "</div>"
      );
    }).join("");

    el.querySelectorAll(".rename-cat").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        var cat = categoryById(id);
        var name = prompt("Rename category", cat.name);
        if (name && name.trim()) {
          cat.name = name.trim().slice(0, 30);
          persist();
          renderCategoryManageList();
          populateCategoryFilterSelect();
          toast("Category renamed");
        }
      });
    });
    el.querySelectorAll(".delete-cat").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (state.categories.length <= 1) {
          toast("You need at least one category.");
          return;
        }
        var count = usage[id] || 0;
        var msg = count
          ? "This category has " + count + " expense" + (count === 1 ? "" : "s") + ". They'll be moved to \"Other\" so your data stays safe."
          : "This category will be removed.";
        showConfirm("Delete this category?", msg, function () {
          deleteCategory(id);
        }, { okLabel: "Delete" });
      });
    });
  }

  function deleteCategory(id) {
    var otherCat = state.categories.find(function (c) { return c.id === "other" && c.id !== id; });
    state.expenses.forEach(function (e) {
      if (e.category === id) e.category = otherCat ? otherCat.id : state.categories[0].id;
    });
    state.categories = state.categories.filter(function (c) { return c.id !== id; });
    persist();
    renderCategoryManageList();
    populateCategoryFilterSelect();
    renderAll();
    toast("Category deleted");
  }

  function initSettingsEvents() {
    document.getElementById("settings-currency").addEventListener("change", function (e) {
      state.settings.currency = e.target.value;
      persist();
      renderAll();
      toast("Currency updated");
    });
    document.getElementById("settings-date-format").addEventListener("change", function (e) {
      state.settings.dateFormat = e.target.value;
      persist();
      renderAll();
    });
    document.querySelectorAll("#settings-theme-segmented .seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.settings.theme = btn.getAttribute("data-theme");
        persist();
        applyTheme();
      });
    });

    document.getElementById("btn-save-salary").addEventListener("click", function () {
      var amount = parseFloat(document.getElementById("settings-salary").value);
      var startDate = document.getElementById("settings-salary-date").value;
      var nextDate = document.getElementById("settings-next-date").value;

      if (isNaN(amount) || amount < 0) { toast("Enter a valid salary amount."); return; }
      if (!startDate || !nextDate) { toast("Please choose both dates."); return; }
      if (parseISODate(nextDate) <= parseISODate(startDate)) { toast("Next salary date must be after the salary date."); return; }

      state.salary.amount = amount;
      state.salary.startDate = startDate;
      state.salary.nextDate = nextDate;
      persist();
      renderAll();
      toast("Salary details saved");
    });

    document.getElementById("btn-add-category").addEventListener("click", function () {
      var input = document.getElementById("input-new-category");
      var name = input.value.trim();
      if (!name) { toast("Enter a category name."); return; }
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || uid();
      if (state.categories.some(function (c) { return c.id === id; })) {
        id = id + "-" + uid().slice(0, 4);
      }
      var palette = ["#FF6B5E", "#4C8DFF", "#F2A93B", "#8B6BFF", "#0F8B8D", "#2F9E6E", "#D65DB1", "#4CB0C9"];
      state.categories.push({ id: id, name: name.slice(0, 30), icon: "🏷️", color: palette[state.categories.length % palette.length] });
      persist();
      input.value = "";
      renderCategoryManageList();
      populateCategoryFilterSelect();
      populateExpenseCategorySelect();
      toast("Category added");
    });

    document.getElementById("btn-export").addEventListener("click", exportData);
    document.getElementById("input-import").addEventListener("change", importData);
    document.getElementById("btn-clear-data").addEventListener("click", function () {
      showConfirm(
        "Clear all data?",
        "This will permanently remove your salary information and expenses from this device. This cannot be undone.",
        function () {
          try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
          state = defaultState();
          document.getElementById("screen-main").hidden = true;
          document.getElementById("screen-setup").hidden = false;
          document.getElementById("form-setup").reset();
          initSetupScreen();
          toast("All data cleared");
        },
        { okLabel: "Clear data" }
      );
    });
  }

  function exportData() {
    var payload = {
      exportedAt: new Date().toISOString(),
      app: "SalaryFlow",
      version: 1,
      data: state
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "salary-expense-backup.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Backup exported");
  }

  function importData(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        toast("That file doesn't look like a valid backup.");
        e.target.value = "";
        return;
      }
      var candidate = parsed && parsed.data ? parsed.data : parsed;
      if (!candidate || typeof candidate !== "object") {
        toast("That file doesn't look like a valid backup.");
        e.target.value = "";
        return;
      }
      showConfirm("Import this backup?", "This will replace your current salary information and expenses with the data in this file.", function () {
        state = sanitizeState(candidate);
        state.onboarded = true;
        persist();
        renderAll();
        applyTheme();
        toast("Data imported successfully");
      }, { okLabel: "Import" });
      e.target.value = "";
    };
    reader.onerror = function () {
      toast("Couldn't read that file.");
      e.target.value = "";
    };
    reader.readAsText(file);
  }

  /* ------------------------------- Expense modal --------------------------------- */

  function populateExpenseCategorySelect() {
    var sel = document.getElementById("expense-category");
    var current = sel.value;
    sel.innerHTML = state.categories.map(function (c) {
      return '<option value="' + c.id + '">' + escapeHTML(c.icon) + " " + escapeHTML(c.name) + "</option>";
    }).join("");
    if (current && state.categories.some(function (c) { return c.id === current; })) sel.value = current;
  }

  function resetExpensePhotoUI() {
    var input = document.getElementById("expense-photo");
    var preview = document.getElementById("expense-photo-preview");
    var img = document.getElementById("expense-photo-preview-img");
    var name = document.getElementById("expense-photo-name");
    if (input) input.value = "";
    if (img) img.removeAttribute("src");
    if (name) name.textContent = "Photo attached";
    if (preview) preview.hidden = true;
  }

  function showExpensePhoto(photo, photoName) {
    var preview = document.getElementById("expense-photo-preview");
    var img = document.getElementById("expense-photo-preview-img");
    var name = document.getElementById("expense-photo-name");
    if (!photo) {
      resetExpensePhotoUI();
      return;
    }
    img.src = photo;
    name.textContent = photoName || "Photo attached";
    preview.hidden = false;
  }

  function compressExpensePhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        reject(new Error("Please select an image file."));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Could not read the image.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("This image format is not supported by this browser.")); };
        img.onload = function () {
          var maxSide = 1280;
          var scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var data = canvas.toDataURL("image/jpeg", 0.72);
          if (data.length > 450000) data = canvas.toDataURL("image/jpeg", 0.58);
          resolve(data);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function initExpensePhotoEvents() {
    var input = document.getElementById("expense-photo");
    var removeBtn = document.getElementById("btn-remove-expense-photo");
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      compressExpensePhoto(file).then(function (data) {
        ui.pendingExpensePhoto = data;
        ui.pendingExpensePhotoName = file.name;
        showExpensePhoto(data, file.name);
      }).catch(function (err) {
        toast(err.message || "Could not attach this photo.");
        input.value = "";
      });
    });
    removeBtn.addEventListener("click", function () {
      ui.pendingExpensePhoto = "";
      ui.pendingExpensePhotoName = "";
      ui.removeExpensePhoto = true;
      resetExpensePhotoUI();
    });
  }

  function openExpenseModal(expenseId) {
    ui.editingExpenseId = expenseId || null;
    populateExpenseCategorySelect();
    document.getElementById("expense-currency-symbol").textContent = currencySymbol();
    clearExpenseErrors();

    var title = document.getElementById("expense-modal-title");
    var form = document.getElementById("form-expense");
    form.reset();
    ui.pendingExpensePhoto = "";
    ui.pendingExpensePhotoName = "";
    ui.removeExpensePhoto = false;
    resetExpensePhotoUI();

    if (expenseId) {
      var exp = state.expenses.find(function (e) { return e.id === expenseId; });
      if (!exp) return;
      title.textContent = "Edit expense";
      document.getElementById("expense-id").value = exp.id;
      document.getElementById("expense-amount").value = exp.amount;
      document.getElementById("expense-category").value = exp.category;
      document.getElementById("expense-date").value = exp.date;
      document.getElementById("expense-note").value = exp.note || "";
      ui.pendingExpensePhoto = exp.photo || "";
      ui.pendingExpensePhotoName = exp.photoName || "";
      if (exp.photo) showExpensePhoto(exp.photo, exp.photoName);
    } else {
      title.textContent = "Add expense";
      document.getElementById("expense-id").value = "";
      document.getElementById("expense-date").value = todayISO();
    }

    document.getElementById("modal-expense").hidden = false;
    setTimeout(function () { document.getElementById("expense-amount").focus(); }, 50);
  }

  function closeExpenseModal() {
    document.getElementById("modal-expense").hidden = true;
    ui.editingExpenseId = null;
  }

  function clearExpenseErrors() {
    document.getElementById("err-expense-amount").textContent = "";
  }

  function initExpenseModalEvents() {
    document.getElementById("btn-fab").addEventListener("click", function () { openExpenseModal(null); });
    document.getElementById("btn-close-expense-modal").addEventListener("click", closeExpenseModal);
    document.getElementById("btn-cancel-expense").addEventListener("click", closeExpenseModal);
    document.getElementById("modal-expense").addEventListener("click", function (e) {
      if (e.target.id === "modal-expense") closeExpenseModal();
    });

    initExpensePhotoEvents();

    document.getElementById("form-expense").addEventListener("submit", function (e) {
      e.preventDefault();
      clearExpenseErrors();

      var amount = parseFloat(document.getElementById("expense-amount").value);
      var category = document.getElementById("expense-category").value;
      var date = document.getElementById("expense-date").value;
      var note = document.getElementById("expense-note").value.trim().slice(0, 120);

      if (isNaN(amount) || amount <= 0) {
        setFieldError("err-expense-amount", "Enter an amount greater than 0.");
        return;
      }
      if (!date) date = todayISO();

      var id = document.getElementById("expense-id").value;
      if (id) {
        var exp = state.expenses.find(function (x) { return x.id === id; });
        if (exp) {
          exp.amount = amount;
          exp.category = category;
          exp.date = date;
          exp.note = note;
          if (ui.removeExpensePhoto) {
            exp.photo = "";
            exp.photoName = "";
          } else if (ui.pendingExpensePhoto) {
            exp.photo = ui.pendingExpensePhoto;
            exp.photoName = ui.pendingExpensePhotoName || "Expense photo";
          }
          exp.cycleKey = getSalaryCycleKey();
        }
        toast("Expense updated");
      } else {
        state.expenses.push({
          id: uid(),
          amount: amount,
          category: category,
          date: date,
          note: note,
          photo: ui.pendingExpensePhoto || "",
          photoName: ui.pendingExpensePhotoName || "",
          cycleKey: getSalaryCycleKey()
        });
        toast("Expense added successfully");
      }
      persist();
      closeExpenseModal();
      renderAll();
    });
  }

  function deleteExpense(id) {
    state.expenses = state.expenses.filter(function (e) { return e.id !== id; });
    persist();
    renderAll();
    toast("Expense deleted");
  }

  /* --------------------------------- Global render -------------------------------- */

  function renderAll() {
    populateCategoryFilterSelect();
    populateExpenseCategorySelect();
    if (ui.activeNav === "home" || document.getElementById("view-home").hidden === false) renderHome();
    if (!document.getElementById("view-expenses").hidden) renderExpensesView();
    if (!document.getElementById("view-reports").hidden) renderReports();
    if (!document.getElementById("view-settings").hidden) renderSettings();
    // Always refresh home data quietly so nav switches show fresh numbers.
    renderHome();
  }

  /* ------------------------------------ Init --------------------------------------- */

  function initNav() {
    document.querySelectorAll("[data-nav]").forEach(function (el) {
      el.addEventListener("click", function () {
        navigate(el.getAttribute("data-nav"));
      });
    });
    document.getElementById("btn-empty-add") && document.getElementById("btn-empty-add").addEventListener("click", function () { openExpenseModal(null); });
    document.getElementById("content").addEventListener("click", function (e) {
      if (e.target && e.target.id === "btn-empty-add") openExpenseModal(null);
    });
  }

  function initThemeToggle() {
    document.getElementById("btn-theme-toggle").addEventListener("click", toggleThemeQuick);
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        if (state.settings.theme === "system") applyTheme();
      });
    }
  }

  function initConfirmModal() {
    document.getElementById("confirm-cancel").addEventListener("click", hideConfirm);
    document.getElementById("confirm-ok").addEventListener("click", function () {
      var cb = ui.confirmCallback;
      hideConfirm();
      if (cb) cb();
    });
    document.getElementById("modal-confirm").addEventListener("click", function (e) {
      if (e.target.id === "modal-confirm") hideConfirm();
    });
  }

  function initQuickEditSalary() {
    document.getElementById("btn-edit-salary-quick").addEventListener("click", function () {
      navigate("settings");
      setTimeout(function () {
        var el = document.getElementById("settings-salary");
        if (el) el.focus();
      }, 100);
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {
          /* PWA support is optional — ignore failures (e.g. running from file://) */
        });
      });
    }
  }

  function boot() {
    state = loadState();
    applyTheme();

    initSetupScreen();
    initNav();
    initExpensesViewEvents();
    initExpenseModalEvents();
    initSettingsEvents();
    initConfirmModal();
    initThemeToggle();
    initQuickEditSalary();

    if (state.onboarded) {
      document.getElementById("screen-setup").hidden = true;
      document.getElementById("screen-main").hidden = false;
      navigate("home");
      renderAll();
    } else {
      document.getElementById("screen-setup").hidden = false;
      document.getElementById("screen-main").hidden = true;
    }

    registerServiceWorker();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
