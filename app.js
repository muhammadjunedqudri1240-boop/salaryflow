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
    theme: "dark",
    pendingExpensePhoto: "",
    pendingExpensePhotoName: "",
    removeExpensePhoto: false,
    crop: null
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
      out.settings.theme = "dark";
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
    // SalaryFlow is intentionally dark-only for the premium finance UI.
    state.settings.theme = "dark";
    document.documentElement.setAttribute("data-theme", "dark");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#070A14");
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
    if (!e.photo) return '<div class="expense-photo-placeholder"><span>' + escapeHTML(categoryById(e.category).icon) + '</span></div>';
    return '<div class="expense-photo-large" title="Expense photo"><img src="' + escapeHTML(e.photo) + '" alt="Attached expense photo" loading="lazy" /></div>';
  }

  function expenseActionMarkup(e) {
    return (
      '<div class="expense-actions" role="group" aria-label="Expense actions">' +
        '<button type="button" class="edit-action" data-id="' + e.id + '" aria-label="Edit expense"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.1-10.1a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z"/><path d="m14.5 7.5 2 2"/></svg></button>' +
        '<button type="button" class="danger-action" data-id="' + e.id + '" aria-label="Delete expense"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v6m4-6v6"/></svg></button>' +
      '</div>'
    );
  }

  function expenseProductCard(e, withActions) {
    var cat = categoryById(e.category);
    var note = e.note || cat.name;
    return (
      '<article class="expense-item expense-product-card" data-id="' + e.id + '">' +
        expensePhotoMarkup(e) +
        '<div class="expense-product-body">' +
          '<div class="expense-product-main">' +
            '<div class="expense-product-copy">' +
              '<h3>' + escapeHTML(note) + '</h3>' +
              '<p>' + escapeHTML(cat.name) + '</p>' +
              '<span class="expense-category-pill" style="--cat:' + cat.color + '">' + escapeHTML(cat.icon) + ' ' + escapeHTML(cat.name) + '</span>' +
              '<time>' + escapeHTML(formatDateFriendly(e.date)) + (e.time ? ' • ' + escapeHTML(e.time) : '') + '</time>' +
            '</div>' +
            '<div class="expense-product-right">' +
              '<strong>-' + formatMoney(e.amount) + '</strong>' +
              (withActions ? expenseActionMarkup(e) : '') +
            '</div>' +
          '</div>' +
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
    var cycle = computeCycle();
    var totalEl = document.getElementById("history-total-expenses");
    var remainingEl = document.getElementById("history-remaining-balance");
    var salaryEl = document.getElementById("history-salary-total");
    if (totalEl) totalEl.textContent = formatMoney(cycle.spent);
    if (remainingEl) remainingEl.textContent = formatMoney(cycle.remaining);
    if (salaryEl) salaryEl.textContent = formatMoney(cycle.salary);

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
    var money = formatMoney;
    var salary = Math.max(0, cycle.salary);
    var remaining = Math.max(0, cycle.remaining);
    var remainingPct = salary > 0 ? Math.max(0, Math.min(100, (remaining / salary) * 100)) : 0;
    var spentPct = salary > 0 ? Math.max(0, Math.min(100, (cycle.spent / salary) * 100)) : 0;

    document.getElementById("rep-salary").textContent = money(salary);
    document.getElementById("rep-remaining").textContent = money(remaining);
    document.getElementById("rep-remaining-sub").textContent = Math.round(remainingPct * 10) / 10 + "% left";
    document.getElementById("rep-donut-total").textContent = money(cycle.spent);
    document.getElementById("rep-cycle-percent").textContent = Math.round(spentPct) + "%";
    document.getElementById("rep-cycle-money").textContent = money(cycle.spent) + " / " + money(salary);

    var cycleText = formatDate(state.salary.startDate) + " → " + formatDate(state.salary.nextDate);
    document.getElementById("rep-cycle-pill-text").textContent = cycleText;
    document.getElementById("rep-cycle-mini").textContent = cycleText;

    var cycleExpenses = getCycleExpenses();
    var byCategory = {};
    cycleExpenses.forEach(function (e) {
      byCategory[e.category] = (byCategory[e.category] || 0) + safeNumber(e.amount, 0);
    });
    var catEntries = Object.keys(byCategory).map(function (id) {
      return { cat: categoryById(id), amount: byCategory[id] };
    }).filter(function (x) { return x.cat; }).sort(function (a, b) { return b.amount - a.amount; });

    var donut = document.getElementById("rep-donut");
    if (catEntries.length && cycle.spent > 0) {
      var stops = [];
      var cursor = 0;
      catEntries.forEach(function (entry) {
        var pct = (entry.amount / cycle.spent) * 100;
        stops.push(entry.cat.color + " " + cursor + "% " + (cursor + pct) + "%");
        cursor += pct;
      });
      donut.style.background = "conic-gradient(" + stops.join(",") + ")";
    } else {
      donut.style.background = "conic-gradient(var(--surface-3) 0 100%)";
    }

    var breakdownEl = document.getElementById("rep-category-breakdown");
    if (catEntries.length) {
      breakdownEl.innerHTML = catEntries.slice(0, 5).map(function (entry) {
        var pct = cycle.spent > 0 ? Math.round((entry.amount / cycle.spent) * 100) : 0;
        return '<div class="report-legend-item">' +
          '<span class="legend-dot" style="background:' + entry.cat.color + '"></span>' +
          '<div class="legend-copy"><strong>' + escapeHTML(entry.cat.name) + '</strong><span>' + money(entry.amount) + '</span></div>' +
          '<b>' + pct + '%</b>' +
        '</div>';
      }).join("");
    } else {
      breakdownEl.innerHTML = '<div class="report-empty">Add an expense to see your spending breakdown.</div>';
    }

    renderMonthlyTrend();

    var ring = document.getElementById("rep-cycle-ring");
    ring.style.background = "conic-gradient(var(--primary) 0 " + spentPct + "%, var(--surface-3) " + spentPct + "% 100%)";

    var metrics = [
      ["Days Passed", cycle.daysPassed + " / " + cycle.totalDays, "◷"],
      ["Days Remaining", String(cycle.daysRemaining), "⌛"],
      ["Avg. Daily Spend", money(cycle.avgDailySpend), "▥"],
      ["Safe Daily Limit", cycle.isOverspent ? money(0) : money(cycle.dailyLimit), "✓"]
    ];
    document.getElementById("rep-cycle").innerHTML = metrics.map(function (m) {
      return '<div class="cycle-metric"><span class="metric-icon">' + m[2] + '</span><div><span>' + m[0] + '</span><strong>' + m[1] + '</strong></div></div>';
    }).join("");

    var status = spendingStatusMessage(cycle);
    var statusClass = status.tone === "danger" ? "danger" : (status.tone === "good" ? "good" : "neutral");
    document.getElementById("rep-cycle-status").innerHTML =
      '<div class="status-icon ' + statusClass + '">' + (statusClass === "danger" ? "!" : "✓") + '</div>' +
      '<strong>' + (statusClass === "good" ? "Stay on track!" : statusClass === "danger" ? "Watch your spending" : "Cycle overview") + '</strong>' +
      '<p>' + escapeHTML(status.text) + '</p>';

    renderReportInsights(cycle, catEntries);
  }

  function renderMonthlyTrend() {
    var el = document.getElementById("rep-monthly-trend");
    if (!el) return;
    var now = new Date();
    var months = [];
    for (var i = 3; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), label: d.toLocaleString(undefined, { month: "short" }), amount: 0 });
    }
    state.expenses.forEach(function (e) {
      var d = parseISODate(e.date);
      if (!d) return;
      var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      var m = months.find(function (x) { return x.key === key; });
      if (m) m.amount += safeNumber(e.amount, 0);
    });
    var max = Math.max.apply(null, months.map(function (m) { return m.amount; }).concat([1]));
    el.innerHTML = months.map(function (m) {
      var height = Math.max(8, Math.round((m.amount / max) * 100));
      return '<div class="trend-col"><span class="trend-value">' + (m.amount ? escapeHTML(moneyCompact(m.amount)) : "—") + '</span><div class="trend-bar-wrap"><div class="trend-bar" style="height:' + height + '%"></div></div><span class="trend-label">' + m.label + '</span></div>';
    }).join("");
  }

  function moneyCompact(amount) {
    if (amount >= 100000) return "₹" + (amount / 100000).toFixed(1).replace(".0", "") + "L";
    if (amount >= 1000) return "₹" + (amount / 1000).toFixed(1).replace(".0", "") + "K";
    return "₹" + Math.round(amount);
  }

  function renderReportInsights(cycle, catEntries) {
    var top = catEntries[0];
    var insights = [
      { tone: "purple", icon: "↗", title: "Highest Spending", value: top ? top.cat.name : "—", sub: top ? Math.round((top.amount / Math.max(1, cycle.spent)) * 100) + "% of total" : "No expenses yet" },
      { tone: "green", icon: "▣", title: "Top Category", value: top ? top.cat.name : "—", sub: top ? money(top.amount) : "Add an expense" },
      { tone: "blue", icon: "◷", title: "Days Left", value: String(cycle.daysRemaining), sub: "until next salary" },
      { tone: "pink", icon: "₹", title: "Remaining Per Day", value: cycle.isOverspent ? money(0) : money(cycle.dailyLimit), sub: "safe to spend" }
    ];
    document.getElementById("rep-insights").innerHTML = insights.map(function (x) {
      return '<div class="insight-card ' + x.tone + '"><span class="insight-icon">' + x.icon + '</span><span class="insight-title">' + x.title + '</span><strong>' + escapeHTML(x.value) + '</strong><small>' + escapeHTML(x.sub) + '</small></div>';
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
            '<button class="rename-cat" data-id="' + c.id + '" aria-label="Rename category">✎ <span>Rename</span></button>' +
            '<button class="delete-cat" data-id="' + c.id + '" aria-label="Delete category">⌫ <span>Delete</span></button>' +
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
    var preview = document.getElementById("expense-photo-preview");
    var img = document.getElementById("expense-photo-preview-img");
    var name = document.getElementById("expense-photo-name");
    resetPhotoInputs();
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

  function initNoCopyProtection() {
    document.addEventListener("copy", function (e) {
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
    });
    document.addEventListener("cut", function (e) {
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
    });
    document.addEventListener("contextmenu", function (e) {
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
    });
  }

  function closePhotoSourceModal() {
    var modal = document.getElementById("modal-photo-source");
    if (modal) modal.hidden = true;
  }

  function closePhotoCropModal() {
    var modal = document.getElementById("modal-photo-crop");
    if (modal) modal.hidden = true;
    ui.crop = null;
  }

  function resetPhotoInputs() {
    var gallery = document.getElementById("expense-photo-gallery");
    var camera = document.getElementById("expense-photo-camera");
    if (gallery) gallery.value = "";
    if (camera) camera.value = "";
  }

  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        reject(new Error("Please select an image file."));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Could not read the image.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("This image format is not supported.")); };
        img.onload = function () { resolve({ img: img, src: reader.result, file: file }); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function distanceBetweenPointers(a, b) {
    var dx = a.clientX - b.clientX;
    var dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function renderCropImage() {
    if (!ui.crop) return;
    var stage = document.getElementById("crop-stage");
    var img = document.getElementById("crop-image");
    var zoomInput = document.getElementById("crop-zoom");
    if (!stage || !img || !ui.crop.image) return;
    if (img.src !== ui.crop.src) img.src = ui.crop.src;

    var size = stage.clientWidth || 320;
    var base = Math.max(size / ui.crop.image.naturalWidth, size / ui.crop.image.naturalHeight);
    var displayW = ui.crop.image.naturalWidth * base * ui.crop.zoom;
    var displayH = ui.crop.image.naturalHeight * base * ui.crop.zoom;
    var minX = size - displayW;
    var minY = size - displayH;
    ui.crop.x = Math.min(0, Math.max(minX, ui.crop.x));
    ui.crop.y = Math.min(0, Math.max(minY, ui.crop.y));

    img.style.width = displayW + "px";
    img.style.height = displayH + "px";
    img.style.left = ui.crop.x + "px";
    img.style.top = ui.crop.y + "px";
    if (zoomInput) zoomInput.value = String(ui.crop.zoom);
  }

  function openPhotoCropper(file) {
    readImageFile(file).then(function (result) {
      ui.crop = {
        image: result.img,
        src: result.src,
        fileName: file.name || "Expense photo",
        zoom: 1,
        x: 0,
        y: 0,
        pointers: {},
        pinchStartDistance: 0,
        pinchStartZoom: 1
      };
      closePhotoSourceModal();
      var modal = document.getElementById("modal-photo-crop");
      modal.hidden = false;
      requestAnimationFrame(function () {
        var stage = document.getElementById("crop-stage");
        var size = stage.clientWidth || 320;
        var base = Math.max(size / result.img.naturalWidth, size / result.img.naturalHeight);
        var displayW = result.img.naturalWidth * base;
        var displayH = result.img.naturalHeight * base;
        ui.crop.x = (size - displayW) / 2;
        ui.crop.y = (size - displayH) / 2;
        renderCropImage();
      });
    }).catch(function (err) {
      toast(err.message || "Could not attach this photo.");
    });
  }

  function finalizePhotoCrop() {
    if (!ui.crop || !ui.crop.image) return;
    var stage = document.getElementById("crop-stage");
    var size = stage.clientWidth || 320;
    var img = ui.crop.image;
    var base = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    var scale = base * ui.crop.zoom;
    var sourceSize = size / scale;
    var sourceX = -ui.crop.x / scale;
    var sourceY = -ui.crop.y / scale;
    sourceX = Math.max(0, Math.min(img.naturalWidth - sourceSize, sourceX));
    sourceY = Math.max(0, Math.min(img.naturalHeight - sourceSize, sourceY));
    sourceSize = Math.min(sourceSize, img.naturalWidth - sourceX, img.naturalHeight - sourceY);

    var outSize = 800;
    var canvas = document.createElement("canvas");
    canvas.width = outSize;
    canvas.height = outSize;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outSize, outSize);
    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outSize, outSize);
    var data = canvas.toDataURL("image/jpeg", 0.78);
    if (data.length > 500000) data = canvas.toDataURL("image/jpeg", 0.64);

    ui.pendingExpensePhoto = data;
    ui.pendingExpensePhotoName = ui.crop.fileName || "Expense photo";
    ui.removeExpensePhoto = false;
    showExpensePhoto(data, ui.pendingExpensePhotoName);
    resetPhotoInputs();
    closePhotoCropModal();
  }

  function initPhotoCropInteractions() {
    var stage = document.getElementById("crop-stage");
    var zoom = document.getElementById("crop-zoom");
    if (!stage || !zoom) return;

    stage.addEventListener("pointerdown", function (e) {
      if (!ui.crop) return;
      stage.setPointerCapture(e.pointerId);
      ui.crop.pointers[e.pointerId] = { clientX: e.clientX, clientY: e.clientY };
      var keys = Object.keys(ui.crop.pointers);
      if (keys.length === 2) {
        ui.crop.pinchStartDistance = distanceBetweenPointers(ui.crop.pointers[keys[0]], ui.crop.pointers[keys[1]]);
        ui.crop.pinchStartZoom = ui.crop.zoom;
      }
      ui.crop.dragStartX = e.clientX;
      ui.crop.dragStartY = e.clientY;
      ui.crop.dragOriginX = ui.crop.x;
      ui.crop.dragOriginY = ui.crop.y;
    });

    stage.addEventListener("pointermove", function (e) {
      if (!ui.crop || !ui.crop.pointers[e.pointerId]) return;
      ui.crop.pointers[e.pointerId] = { clientX: e.clientX, clientY: e.clientY };
      var keys = Object.keys(ui.crop.pointers);
      if (keys.length >= 2) {
        var d = distanceBetweenPointers(ui.crop.pointers[keys[0]], ui.crop.pointers[keys[1]]);
        if (ui.crop.pinchStartDistance > 0) {
          ui.crop.zoom = Math.max(1, Math.min(3, ui.crop.pinchStartZoom * (d / ui.crop.pinchStartDistance)));
          renderCropImage();
        }
        return;
      }
      ui.crop.x = ui.crop.dragOriginX + (e.clientX - ui.crop.dragStartX);
      ui.crop.y = ui.crop.dragOriginY + (e.clientY - ui.crop.dragStartY);
      renderCropImage();
    });

    function releasePointer(e) {
      if (!ui.crop) return;
      delete ui.crop.pointers[e.pointerId];
      if (Object.keys(ui.crop.pointers).length < 2) ui.crop.pinchStartDistance = 0;
    }
    stage.addEventListener("pointerup", releasePointer);
    stage.addEventListener("pointercancel", releasePointer);
    stage.addEventListener("pointerleave", function () {});

    zoom.addEventListener("input", function () {
      if (!ui.crop) return;
      var oldZoom = ui.crop.zoom;
      var newZoom = parseFloat(zoom.value) || 1;
      var stageSize = stage.clientWidth || 320;
      var centerX = stageSize / 2;
      var centerY = stageSize / 2;
      ui.crop.x = centerX - (centerX - ui.crop.x) * (newZoom / oldZoom);
      ui.crop.y = centerY - (centerY - ui.crop.y) * (newZoom / oldZoom);
      ui.crop.zoom = newZoom;
      renderCropImage();
    });
  }

  function initExpensePhotoEvents() {
    var addBtn = document.getElementById("btn-add-expense-photo");
    var sourceModal = document.getElementById("modal-photo-source");
    var cameraBtn = document.getElementById("btn-photo-camera");
    var galleryBtn = document.getElementById("btn-photo-gallery");
    var cameraInput = document.getElementById("expense-photo-camera");
    var galleryInput = document.getElementById("expense-photo-gallery");
    var removeBtn = document.getElementById("btn-remove-expense-photo");

    addBtn.addEventListener("click", function () { sourceModal.hidden = false; });
    document.getElementById("btn-close-photo-source").addEventListener("click", closePhotoSourceModal);
    document.getElementById("btn-cancel-photo-source").addEventListener("click", closePhotoSourceModal);
    sourceModal.addEventListener("click", function (e) { if (e.target === sourceModal) closePhotoSourceModal(); });

    cameraBtn.addEventListener("click", function () {
      closePhotoSourceModal();
      resetPhotoInputs();
      cameraInput.click();
    });
    galleryBtn.addEventListener("click", function () {
      closePhotoSourceModal();
      resetPhotoInputs();
      galleryInput.click();
    });

    function handleFileInput(input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) return;
        openPhotoCropper(file);
      });
    }
    handleFileInput(cameraInput);
    handleFileInput(galleryInput);

    document.getElementById("btn-cancel-photo-crop").addEventListener("click", function () {
      resetPhotoInputs();
      closePhotoCropModal();
    });
    document.getElementById("btn-done-photo-crop").addEventListener("click", finalizePhotoCrop);
    document.getElementById("modal-photo-crop").addEventListener("click", function (e) {
      if (e.target.id === "modal-photo-crop") {
        resetPhotoInputs();
        closePhotoCropModal();
      }
    });
    initPhotoCropInteractions();

    removeBtn.addEventListener("click", function () {
      ui.pendingExpensePhoto = "";
      ui.pendingExpensePhotoName = "";
      ui.removeExpensePhoto = true;
      resetPhotoInputs();
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


  /* -------------------------- Background music --------------------------- */

  var musicState = { enabled: true, started: false };

  function setMusicUI() {
    var on = !!musicState.enabled;
    var btn = document.getElementById("btn-music");
    var setting = document.getElementById("settings-music-toggle");
    if (btn) { btn.setAttribute("aria-pressed", String(on)); btn.classList.toggle("is-on", on); }
    if (setting) { setting.setAttribute("aria-pressed", String(on)); setting.textContent = on ? "On" : "Off"; setting.classList.toggle("is-on", on); }
  }

  function tryStartMusic() {
    if (!musicState.enabled) return;
    var audio = document.getElementById("bg-music");
    if (!audio) return;
    audio.volume = 0.11;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
    musicState.started = true;
  }

  function toggleMusic() {
    musicState.enabled = !musicState.enabled;
    try { localStorage.setItem("salaryflow_music", musicState.enabled ? "on" : "off"); } catch (e) {}
    var audio = document.getElementById("bg-music");
    if (musicState.enabled) { tryStartMusic(); toast("Background music on"); }
    else if (audio) { audio.pause(); audio.currentTime = 0; toast("Background music off"); }
    setMusicUI();
  }

  function initBackgroundMusic() {
    try { musicState.enabled = localStorage.getItem("salaryflow_music") !== "off"; } catch (e) {}
    setMusicUI();
    var btn = document.getElementById("btn-music");
    var setting = document.getElementById("settings-music-toggle");
    if (btn) btn.addEventListener("click", toggleMusic);
    if (setting) setting.addEventListener("click", toggleMusic);
    var once = function () { if (musicState.enabled) tryStartMusic(); document.removeEventListener("pointerdown", once); document.removeEventListener("touchstart", once); };
    document.addEventListener("pointerdown", once, { passive: true });
    document.addEventListener("touchstart", once, { passive: true });
  }

  /* ------------------------------------ Init --------------------------------------- */

  function initNav() {
    document.querySelectorAll("[data-nav]").forEach(function (el) {
      el.addEventListener("click", function () {
        navigate(el.getAttribute("data-nav"));
      });
    });
    document.getElementById("btn-empty-add") && document.getElementById("btn-empty-add").addEventListener("click", function () { openExpenseModal(null); });
    document.getElementById("nav-add-expense") && document.getElementById("nav-add-expense").addEventListener("click", function () { openExpenseModal(null); });
    document.getElementById("history-filter-toggle") && document.getElementById("history-filter-toggle").addEventListener("click", function () {
      var row = document.getElementById("filter-row");
      if (row) row.classList.toggle("show-all-filters");
    });
    document.getElementById("content").addEventListener("click", function (e) {
      if (e.target && e.target.id === "btn-empty-add") openExpenseModal(null);
    });
  }

  function initThemeToggle() {
    // Theme switching is intentionally disabled: SalaryFlow uses dark mode only.
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
    initBackgroundMusic();
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
