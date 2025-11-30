const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

const MERCHANT_TON = "UQC0hJAYzKWuRKVnUtu_jeHgbyxznehBllc63azIdeoPUBfW";

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

let tonUI = null;


function initTon() {
  tonUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: "https://vorn-studio.github.io/0059bot/tonconnect-manifest.json",
  });

  tonUI.onStatusChange((wallet) => {
    if (wallet?.account?.address) {
        state.tonWallet = wallet.account.address;
        updateTonWalletUI();
    }
});

}


// ----------------------- INIT -----------------------

document.addEventListener("DOMContentLoaded", () => {
  initTelegram();
  setTimeout(initTon, 100);   
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
  const balTxt = formatAmount(state.balance) + " TON";
  const depTxt = formatAmount(state.vipDeposit) + " TON";

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
  if (vipDaily) vipDaily.textContent = formatAmount(daily) + " TON";

  const walletTxt = state.tonWallet || "not linked";
  if (walletBadge) walletBadge.textContent = walletTxt;
  if (walletLabel) walletLabel.textContent = walletTxt;
}

function updateTonWalletUI() {
    const label = document.getElementById("mm-ton-wallet");
    const full = document.getElementById("mm-wallet-ton-label");

    if (!label) return;
    if (!full) return;

    if (!state.tonWallet) {
        label.textContent = "not linked";
        full.textContent = "not linked";
        return;
    }

    const addr = state.tonWallet;
    const short = addr.slice(0, 4) + "..." + addr.slice(-4);

    label.textContent = short;
    full.textContent = addr;
}

function toNano(tonAmount) {
  const n = Number(tonAmount || 0);
  return String(Math.round(n * 1e9)); // 1 TON = 1e9 nanoTON
}

async function payVipWithTon(tonAmount) {
  if (!tonUI) {
    showToast("Connect TON wallet first");
    return;
  }

  try {
    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 600, // 10 րոպե
      messages: [
        {
          address: MERCHANT_TON,          // քո TON հասցեն
          amount: toNano(tonAmount),      // քանի TON
        },
      ],
    };

    await tonUI.sendTransaction(tx);
    showToast("Payment request sent. Confirm in TON wallet.");

    // այստեղ հետո backend-ով կավելացնենք VIP deposit-ը
  } catch (e) {
    console.error("TON payment error:", e);
    showToast("Payment cancelled or failed");
  }
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
    meta.textContent = `Reward: ${formatAmount(task.reward)} TON`;

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
  const buyVip = document.getElementById("btn-buy-vip");

  if (buyVip) {
    buyVip.addEventListener("click", () => {
        document.getElementById("ton-modal").classList.remove("hidden");
    });
}

// Cancel button
document.getElementById("ton-cancel").addEventListener("click", () => {
    document.getElementById("ton-modal").classList.add("hidden");
});

// Confirm payment button
document.getElementById("ton-confirm").addEventListener("click", async () => {
    const amount = Number(document.getElementById("ton-amount-input").value);

    if (!amount || amount <= 0) {
        showToast("Invalid amount");
        return;
    }

    document.getElementById("ton-modal").classList.add("hidden");

    try {
        await tonUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 300,
            messages: [
                {
                    address: MERCHANT_TON,
                    amount: (amount * 1e9).toString()
                }
            ]
        });

        showToast("⏳ Waiting for payment confirmation...");

        tg.sendData(JSON.stringify({
            action: "vip_payment",
            ton: amount
        }));

    } catch (e) {
        showError("❌ Payment failed or cancelled. Not enough TON.");
    }
});



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
      // showToast("Tasks refreshed (demo)");
    });
  }
  if (openWallet) {
  openWallet.addEventListener("click", () => {
    switchToTab("wallet");
    updateTonWalletUI();
  });
}

  if (connectTon) {
  connectTon.addEventListener("click", () => {
    if (!tonUI) {
      showToast("Wallet module not ready yet");
      return;
    }
    tonUI.openModal();
  });
}

  if (openBotWithdraw) {
    openBotWithdraw.addEventListener("click", () => {
        window.Telegram.WebApp.sendData(
            JSON.stringify({ action: "open_withdraw" })
        );
    });
}


  const inviteFriends = document.getElementById("btn-invite-friends");
  if (inviteFriends) {
    inviteFriends.addEventListener("click", () => {
      const uid = state.user.id || 0;

      const deepLink = `https://t.me/n0059_bot?start=ref_${uid}`;
      const shareText = "Join Main Money and earn with me!";
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(shareText)}`;

      if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, "_blank");
      }
    });
  }



}

// ===== WITHDRAW POPUP =====
const withdrawModal = document.getElementById("withdraw-modal");
const withdrawInput = document.getElementById("withdraw-input");
const withdrawConfirm = document.getElementById("withdraw-confirm");
const withdrawCancel = document.getElementById("withdraw-cancel");

// Open popup when user clicks button
if (openBotWithdraw) {
    openBotWithdraw.addEventListener("click", () => {
        withdrawInput.value = "";
        withdrawModal.classList.remove("hidden");
    });
}

// Close popup
withdrawCancel.addEventListener("click", () => {
    withdrawModal.classList.add("hidden");
});

// Confirm withdraw
withdrawConfirm.addEventListener("click", () => {
    const amount = Number(withdrawInput.value);

    if (!amount || amount < 1) {
        showError("Enter a valid TON amount (min 1 TON).");
        return;
    }

    // Show success message
    withdrawModal.classList.add("hidden");
    showToast("Withdraw request created!");
});

const disconnectTon = document.getElementById("btn-disconnect-ton");

if (disconnectTon) {
    disconnectTon.addEventListener("click", () => {
        tg.sendData(JSON.stringify({
            action: "disconnect_wallet"
        }));

        // UI update (optional)
        state.tonWallet = null;
        updateTonWalletUI();
        showToast("TON Wallet disconnected");
    });
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

function showError(msg) {
    const modal = document.getElementById("mm-error-modal");
    const text = document.getElementById("mm-error-text");
    const closeBtn = document.getElementById("mm-error-close");

    if (!modal || !text) return;

    text.textContent = msg;
    modal.classList.remove("hidden");

    closeBtn.onclick = () => {
        modal.classList.add("hidden");
    };
}


// small toast (uses Telegram alert if inside WebApp)
function showToast(msg) {
    const modal = document.getElementById("mm-error-modal");
    const text = document.getElementById("mm-error-text");

    text.textContent = msg;
    modal.classList.remove("hidden");
}

document.getElementById("mm-error-close").addEventListener("click", () => {
    document.getElementById("mm-error-modal").classList.add("hidden");
});
