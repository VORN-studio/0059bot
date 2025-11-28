// Main Money WebApp frontend
// This is a UI layer. Later we can connect it to real API endpoints.

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

const state = {
  user: {
    id: null,
    username: null,
    first_name: null,
  },
  balance: 0,
  vipDeposit: 0,
  tonWallet: null,
  todayTasks: [
    {
      id: 1,
      title: "Watch partner video",
      reward: 50,
      status: "pending",
    },
    {
      id: 2,
      title: "Join Telegram channel",
      reward: 50,
      status: "pending",
    },
    {
      id: 3,
      title: "Stay in channel 5 min",
      reward: 50,
      status: "pending",
    },
  ],
};

// ----------------------- INIT -----------------------

document.addEventListener("DOMContentLoaded", () => {
  initTelegram();
  initTabs();
  initQuickActions();
  renderFromState();
});

// Telegram init
function initTelegram() {
  if (tg) {
    tg.expand();
    tg.enableClosingConfirmation();
    const user = tg.initDataUnsafe?.user;
    if (user) {
      state.user.id = user.id;
      state.user.username = user.username || null;
      state.user.first_name = user.first_name || "User";

      state.balance = 0;
      state.vipDeposit = 0;
      state.tonWallet = null;
    }
  } else {
    // Demo mode (opened in browser)
    state.user.id = 0;
    state.user.username = "demo_user";
    state.user.first_name = "Demo User";
    state.balance = 123.4567;
    state.vipDeposit = 1000;
    state.tonWallet = "UQDxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  }
}

// ----------------------- UI RENDER -----------------------

function renderFromState() {
  renderUserProfile();
  renderFinancialInfo();
  renderTasks();
}

function renderUserProfile() {
  const initial = (state.user.first_name || "M").charAt(0).toUpperCase();

  const avatarSmall = document.getElementById("mm-avatar-initial");
  const avatarBig = document.getElementById("mm-avatar-initial-big");
  if (avatarSmall) avatarSmall.textContent = initial;
  if (avatarBig) avatarBig.textContent = initial;

  const name = document.getElementById("mm-profile-name");
  const username = document.getElementById("mm-profile-username");
  const id = document.getElementById("mm-profile-id");

  if (name) name.textContent = state.user.first_name || "User";
  if (username)
    username.textContent = state.user.username
      ? "@" + state.user.username
      : "@unknown";
  if (id) id.textContent = "ID: " + (state.user.id || "0");
}

function renderFinancialInfo() {
  const balTxt = formatAmount(state.balance) + " USDT";
  const depTxt = formatAmount(state.vipDeposit) + " USDT";

  const balanceMain = document.getElementById("mm-balance-amount");
  const vipDeposit = document.getElementById("mm-vip-deposit");
  const vipDeposit2 = document.getElementById("mm-vip-deposit-2");
  const vipDaily = document.getElementById("mm-vip-daily");
  const walletBadge = document.getElementById("mm-ton-wallet");
  const walletLabel = document.getElementById("mm-wallet-ton-label");
  const walletBalance = document.getElementById("mm-wallet-balance");

  if (balanceMain) balanceMain.textContent = balTxt;
  if (walletBalance) walletBalance.textContent = balTxt;
  if (vipDeposit) vipDeposit.textContent = depTxt;
  if (vipDeposit2) vipDeposit2.textContent = depTxt;

  const daily = state.vipDeposit * 0.05;
  if (vipDaily) vipDaily.textContent = formatAmount(daily) + " USDT";

  const walletTxt = state.tonWallet || "not linked";
  if (walletBadge) walletBadge.textContent = walletTxt;
  if (walletLabel) walletLabel.textContent = walletTxt;
}

function renderTasks() {
  const container = document.getElementById("mm-task-list");
  if (!container) return;
  container.innerHTML = "";

  let completed = 0;
  let earned = 0;

  state.todayTasks.forEach((task) => {
    if (task.status === "completed") {
      completed += 1;
      earned += task.reward;
    }

    const item = document.createElement("div");
    item.className = "mm-task-item";

    const main = document.createElement("div");
    main.className = "mm-task-main";

    const title = document.createElement("div");
    title.className = "mm-task-title";
    title.textContent = task.title;

    const meta = document.createElement("div");
    meta.className = "mm-task-meta";
    meta.textContent = `Reward: ${formatAmount(task.reward)} USDT`;

    main.appendChild(title);
    main.appendChild(meta);

    const status = document.createElement("div");
    status.className = "mm-task-status " + task.status;
    status.textContent =
      task.status === "pending" ? "Pending" : "Completed";

    item.appendChild(main);
    item.appendChild(status);

    container.appendChild(item);
  });

  // update dashboard counters
  const todayCompleted = document.getElementById("mm-today-completed");
  const todayEarned = document.getElementById("mm-today-earned");
  if (todayCompleted) todayCompleted.textContent = `${completed} / ${state.todayTasks.length}`;
  if (todayEarned) todayEarned.textContent = formatAmount(earned);
}

// ----------------------- TABS & NAV -----------------------

function initTabs() {
  const tabs = document.querySelectorAll(".mm-tab");
  const pages = document.querySelectorAll(".mm-page");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");

      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      pages.forEach((p) => p.classList.remove("active"));
      const page = document.getElementById("page-" + target);
      if (page) page.classList.add("active");
    });
  });
}

// quick actions from Dashboard
function initQuickActions() {
  const openTasks = document.getElementById("btn-open-tasks");
  const openVip = document.getElementById("btn-open-vip");
  const openWallet = document.getElementById("btn-open-wallet");
  const openWithdraw = document.getElementById("btn-open-withdraw");
  const refreshTasks = document.getElementById("btn-refresh-tasks");
  const connectTon = document.getElementById("btn-connect-ton");
  const openBotWithdraw = document.getElementById("btn-open-bot-withdraw");

  if (openTasks) {
    openTasks.addEventListener("click", () => switchToTab("tasks"));
  }
  if (openVip) {
    openVip.addEventListener("click", () => switchToTab("vip"));
  }
  if (openWallet) {
    openWallet.addEventListener("click", () => switchToTab("wallet"));
  }
  if (openWithdraw) {
    openWithdraw.addEventListener("click", () => switchToTab("wallet"));
  }
  if (refreshTasks) {
    refreshTasks.addEventListener("click", () => {
      // Քանի դեռ backend API չունենք, ուղղակի ցնցում ենք UI-ն
      renderTasks();
      showToast("Tasks refreshed (demo)");
    });
  }
  if (connectTon) {
    connectTon.addEventListener("click", () => {
      if (tg && tg.openTelegramLink) {
        tg.openTelegramLink("https://t.me/wallet");
      } else {
        window.open("https://t.me/wallet", "_blank");
      }
    });
  }
  if (openBotWithdraw) {
    openBotWithdraw.addEventListener("click", () => {
      if (tg && tg.close) {
        showToast("Open bot and press \"Balance & Withdraw\" button.");
        tg.close();
      } else {
        showToast("Open the bot chat and use the withdraw button.");
      }
    });
  }
}

function switchToTab(tabName) {
  const tabBtn = document.querySelector(`.mm-tab[data-tab="${tabName}"]`);
  if (!tabBtn) return;
  tabBtn.click();
}

// ----------------------- HELPERS -----------------------

function formatAmount(value) {
  const num = Number(value || 0);
  return num.toFixed(4);
}

// small toast (uses Telegram alert if inside WebApp)
function showToast(msg) {
  if (tg && tg.showAlert) {
    tg.showAlert(msg);
  } else {
    alert(msg);
  }
}
