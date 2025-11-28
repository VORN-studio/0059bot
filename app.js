const API_BASE = ""; // same domain (Render) – leave empty

// --------------- TELEGRAM HELPERS ---------------
function tg() {
  return window.Telegram && Telegram.WebApp ? Telegram.WebApp : null;
}

function tgAlert(msg) {
  const t = tg();
  if (t && t.showAlert) t.showAlert(msg);
  else alert(msg);
}

function getUserId() {
  const t = tg();
  return t?.initDataUnsafe?.user?.id || null;
}



// --------------- LANGUAGE ---------------
let currentLang = "en";

function loadLang() {
  try {
    const saved = localStorage.getItem("lang_0059");
    if (saved && (saved === "en" || saved === "ru")) {
      currentLang = saved;
    }
  } catch (e) {}
}

function applyLang() {
  const label = document.getElementById("current-lang");
  if (label) label.textContent = currentLang === "ru" ? "Русский" : "English";

  const inviteBtn = document.getElementById("invite-btn");
  const inviteFriendsBtn = document.getElementById("btn-invite-friends");
  const text = currentLang === "ru" ? "ПРИГЛАСИТЬ ДРУЗЕЙ" : "INVITE FRIENDS";
  if (inviteBtn) inviteBtn.textContent = text;
  if (inviteFriendsBtn) inviteFriendsBtn.textContent = text;
}

function changeLang(lang) {
  currentLang = lang;
  try {
    localStorage.setItem("lang_0059", lang);
  } catch (e) {}
  applyLang();
  const dd = document.getElementById("lang-dropdown");
  if (dd) dd.classList.add("hidden");
}

// --------------- PAGE NAVIGATION ---------------
function showPage(pageId) {
  document.querySelectorAll(".page").forEach((el) => el.classList.add("hidden"));
  const page = document.getElementById(pageId);
  if (page) page.classList.remove("hidden");

  // եթե wallet էջ է՝ բեռնում ենք տվյալները
  if (pageId === "page-wallet") {
    loadBalance();
    loadWalletInfo();
  }
  if (pageId === "home-page") {
    loadBalance();
  }
}

function goHome() {
  showPage("home-page");
  setActiveNav("home");
}

function setActiveNav(tab) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.remove("nav-active");
  });
  const btn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (btn) btn.classList.add("nav-active");
}

// --------------- BOTTOM NAV INIT ---------------
function initBottomNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab === "home") {
        showPage("home-page");
      } else if (tab === "activity") {
        showPage("page-activity");
      } else if (tab === "messages") {
        showPage("page-messages");
      } else if (tab === "settings") {
        showPage("settings-page");
      }
      setActiveNav(tab);
    });
  });

  const langRow = document.getElementById("lang-row");
  const langDropdown = document.getElementById("lang-dropdown");
  if (langRow && langDropdown) {
    langRow.addEventListener("click", () => {
      langDropdown.classList.toggle("hidden");
    });
  }
}

// --------------- HOME GRID TILES ---------------
function initTiles() {
  const map = {
    earn: "page-earn",
    invest: "page-invest",
    friends: "page-friends",
    tasks: "page-tasks",
    shop: "page-shop",
    games: "page-games",
    wallet: "page-wallet",
    clan: "page-clan",
    offers: "page-offers",
  };

  document.querySelectorAll(".tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const sec = tile.getAttribute("data-section");
      const pageId = map[sec];
      if (pageId) {
        showPage(pageId);
      }
    });
  });
}

// --------------- BALANCE / EARN ---------------
async function loadBalance() {
  const uid = getUserId();
  if (!uid) return;

  try {
    const res = await fetch(`${API_BASE}/api/get_balance?user_id=${uid}`);
    const data = await res.json();
    if (!data.ok) return;
    const bal = Number(data.balance || 0);
    const text = bal.toFixed(2) + " USDT";
    const headerBalance = document.getElementById("balanceAmount");
    const walletBalance = document.getElementById("wallet-balance");
    if (headerBalance) headerBalance.textContent = text;
    if (walletBalance) walletBalance.textContent = text;
  } catch (e) {
    console.error("loadBalance error:", e);
  }
}

async function tapEarn() {
  const uid = getUserId();
  if (!uid) {
    tgAlert("User not found (Telegram).");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/add_earn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: uid, amount: 0.1 }),
    });
    const data = await res.json();
    if (!data.ok) {
      tgAlert("Error");
      return;
    }
    const bal = Number(data.balance || 0);
    const text = bal.toFixed(2) + " USDT";
    const headerBalance = document.getElementById("balanceAmount");
    const walletBalance = document.getElementById("wallet-balance");
    if (headerBalance) headerBalance.textContent = text;
    if (walletBalance) walletBalance.textContent = text;
    tgAlert(`+0.10 USDT!\nNew balance: ${bal.toFixed(2)} USDT`);
  } catch (e) {
    console.error("tapEarn error:", e);
  }
}

// --------------- FRIENDS / INVITE ---------------
function inviteFriends() {
  const t = tg();
  const user = t?.initDataUnsafe?.user;
  const username = user?.username || "";
  const text =
    currentLang === "ru"
      ? `Присоединяйся ко мне в 0059Bot, ${username || "друг"}!`
      : `Join 0059Bot with ${username || "me"}!`;
  const url = "";

  const link = `https://t.me/share/url?url=${encodeURIComponent(
    url
  )}&text=${encodeURIComponent(text)}`;

  if (t && t.openTelegramLink) t.openTelegramLink(link);
  else window.open(link, "_blank");
}

// --------------- TELEGRAM TON WALLET ---------------
function openTonWallet() {
  const t = tg();
  if (t && t.openTelegramLink) {
    t.openTelegramLink("https://t.me/wallet");
  } else {
    window.open("https://t.me/wallet", "_blank");
  }
}

// --------------- WALLET API ---------------
async function loadWalletInfo() {
  const uid = getUserId();
  if (!uid) return;

  try {
    const res = await fetch(`${API_BASE}/api/get_wallet?user_id=${uid}`);
    const data = await res.json();
    if (!data.ok) return;

    const attached = document.getElementById("wallet-attached");
    const form = document.getElementById("wallet-form");
    const ntext = document.getElementById("wallet-network-text");
    const atext = document.getElementById("wallet-address-text");

    if (data.address) {
      if (attached) attached.classList.remove("hidden");
      if (form) form.classList.add("hidden");
      if (ntext) ntext.textContent = data.network || "";
      if (atext) atext.textContent = data.address || "";
    } else {
      if (attached) attached.classList.add("hidden");
      if (form) form.classList.remove("hidden");
    }
  } catch (e) {
    console.error("loadWalletInfo error:", e);
  }
}

async function saveWallet() {
  const uid = getUserId();
  if (!uid) {
    tgAlert("User not found.");
    return;
  }
  const netEl = document.getElementById("wallet-network");
  const addrEl = document.getElementById("wallet-address-input");
  const network = netEl?.value || "";
  const address = addrEl?.value || "";

  if (!network || !address) {
    tgAlert("Fill all fields.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/set_wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: uid, network, address }),
    });
    const data = await res.json();
    if (!data.ok) {
      tgAlert("Error saving wallet.");
      return;
    }
    tgAlert("Wallet saved!");
    loadWalletInfo();
  } catch (e) {
    console.error("saveWallet error:", e);
  }
}

function openEditWallet() {
  const attached = document.getElementById("wallet-attached");
  const form = document.getElementById("wallet-form");
  if (attached) attached.classList.add("hidden");
  if (form) form.classList.remove("hidden");
}

async function sendWithdraw() {
  const uid = getUserId();
  if (!uid) {
    tgAlert("User not found.");
    return;
  }
  const amtEl = document.getElementById("withdraw-amount");
  const amount = parseFloat(amtEl?.value || "0");

  if (!amount || amount <= 0) {
    tgAlert("Enter correct amount.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/request_withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: uid, amount }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (data.error === "wallet_not_set") tgAlert("Attach payout wallet first.");
      else if (data.error === "not_enough_balance") tgAlert("Not enough balance.");
      else tgAlert("Error: " + data.error);
      return;
    }
    tgAlert("Withdraw request sent!");
    loadBalance();
  } catch (e) {
    console.error("sendWithdraw error:", e);
  }
}

// --------------- INIT ---------------
document.addEventListener("DOMContentLoaded", () => {
  // Telegram init
  const t = tg();
  if (t) {
    t.expand();
    t.enableClosingConfirmation();
  }

  // Lang
  loadLang();
  applyLang();

  // Nav / tiles
  initBottomNav();
  initTiles();

  // Handlers
  const homeInvite = document.getElementById("invite-btn");
  if (homeInvite) homeInvite.addEventListener("click", inviteFriends);

  const friendsInvite = document.getElementById("btn-invite-friends");
  if (friendsInvite) friendsInvite.addEventListener("click", inviteFriends);

  const btnEarnTap = document.getElementById("btn-earn-tap");
  if (btnEarnTap) btnEarnTap.addEventListener("click", tapEarn);

  const btnTonWallet = document.getElementById("btn-open-ton-wallet");
  if (btnTonWallet) btnTonWallet.addEventListener("click", openTonWallet);

  // First page
  showPage("home-page");
  setActiveNav("home");
  loadBalance();
});

// expose some functions for inline handlers
window.changeLang = changeLang;
window.goHome = goHome;
window.openEditWallet = openEditWallet;
window.saveWallet = saveWallet;
window.sendWithdraw = sendWithdraw;
window.openTonWallet = openTonWallet;


// =====================================================
// I18N TRANSLATIONS (ADD THIS PART TO YOUR app.js FILE)
// =====================================================

const i18n = {
  en: {
    tile_earn: "Earn",
    tile_invest: "Invest",
    tile_friends: "Friends",
    tile_tasks: "Tasks",
    tile_shop: "Shop",
    tile_games: "Games",
    tile_wallet: "Wallet",
    tile_clan: "Clan",
    tile_offers: "Offers",
  },

  ru: {
    tile_earn: "Заработок",
    tile_invest: "Инвестиции",
    tile_friends: "Друзья",
    tile_tasks: "Задания",
    tile_shop: "Магазин",
    tile_games: "Игры",
    tile_wallet: "Кошелёк",
    tile_clan: "Клан",
    tile_offers: "Офферы",
  }
};


// =====================================================
// UPDATE applyLang() TO THIS VERSION
// =====================================================
function applyLang() {
  const dict = i18n[currentLang];

  // փոփոխում է բոլոր data-i18n տեքստերը
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });

  // Փոխում է Settings-ի լեզվի անունը
  const label = document.getElementById("current-lang");
  if (label) label.textContent = currentLang === "ru" ? "Русский" : "English";
}
