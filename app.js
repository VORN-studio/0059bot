const API = "";

// ---------------------- TELEGRAM ----------------------
function TG() {
  return window.Telegram ? Telegram.WebApp : null;
}

function initTG() {
  const tg = TG();
  if (!tg) return;
  tg.expand();
  tg.enableClosingConfirmation();
}

function alertTG(msg) {
  const tg = TG();
  if (tg && tg.showAlert) tg.showAlert(msg);
  else alert(msg);
}

// ---------------------- LANGUAGE ----------------------
let lang = "en";
const translations = {
  en: { friends: "Invite Friends" },
  ru: { friends: "Пригласить друзей" },
};

function applyLang() {
  document.getElementById("invite-btn").textContent =
    lang === "ru" ? "ПРИГЛАСИТЬ ДРУЗЕЙ" : "INVITE FRIENDS";
  document.getElementById("current-lang").textContent =
    lang === "ru" ? "Русский" : "English";
}

function changeLang(l) {
  lang = l;
  localStorage.setItem("lang0059", l);
  applyLang();
  document.getElementById("lang-dropdown").classList.add("hidden");
}

// ---------------------- NAVIGATION ----------------------
function show(page) {
  document.querySelectorAll(".page").forEach((el) => el.classList.add("hidden"));
  document.getElementById(page).classList.remove("hidden");
}

function initNav() {
  document.querySelectorAll(".nav button").forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      if (tab === "settings") show("settings-page");
      else if (tab === "home") show("home-page");
      else alertTG("Coming soon");
    };
  });
}

// ---------------------- BALANCE ----------------------
async function loadBalance() {
  const tg = TG();
  const uid = tg?.initDataUnsafe?.user?.id;
  if (!uid) return;

  const res = await fetch(`${API}/api/get_balance?user_id=${uid}`);
  const data = await res.json();
  document.getElementById("balanceAmount").textContent =
    data.balance.toFixed(2) + " USDT";
  document.getElementById("wallet-balance").textContent =
    data.balance.toFixed(2) + " USDT";
}

// Earn (+0.1)
async function earn() {
  const tg = TG();
  const uid = tg?.initDataUnsafe?.user?.id;
  const res = await fetch(`${API}/api/add_earn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: uid, amount: 0.1 }),
  });
  const data = await res.json();
  alertTG("You earned +0.1 USDT!");
  document.getElementById("balanceAmount").textContent =
    data.balance.toFixed(2) + " USDT";
}

// ---------------------- FRIENDS ----------------------
function inviteFriends() {
  const tg = TG();
  const user = tg?.initDataUnsafe?.user;
  const text = `Join 0059Bot with ${user?.username || "me"}!`;
  tg.openTelegramLink(
    `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`
  );
}

// ---------------------- TON CONNECT ----------------------
let tonUI = null;
let tonWallet = null;

function initTon() {
  tonUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: "https://vorn-studio.github.io/0059bot/tonconnect-manifest.json",
  });

  tonUI.onStatusChange((w) => {
    tonWallet = w;
    updateTonUI();
  });
}

function updateTonUI() {
  document.getElementById("wallet-status").textContent = tonWallet
    ? "Connected"
    : "Not Connected";

  document.getElementById("wallet-address").textContent = tonWallet
    ? tonWallet.account.address.slice(0, 6) + "..." + tonWallet.account.address.slice(-4)
    : "—";
}

// ---------------------- PAYOUT WALLET ----------------------
async function loadWalletInfo() {
  const uid = TG()?.initDataUnsafe?.user?.id;
  const res = await fetch(`${API}/api/get_wallet?user_id=${uid}`);
  const data = await res.json();

  if (data.address) {
    document.getElementById("wallet-attached").classList.remove("hidden");
    document.getElementById("wallet-form").classList.add("hidden");

    document.getElementById("wallet-network-text").textContent = data.network;
    document.getElementById("wallet-address-text").textContent = data.address;
  } else {
    document.getElementById("wallet-attached").classList.add("hidden");
    document.getElementById("wallet-form").classList.remove("hidden");
  }
}

function openWallet() {
  show("wallet-page");
  loadWalletInfo();
  loadBalance();
}

async function saveWallet() {
  const uid = TG().initDataUnsafe.user.id;
  const net = document.getElementById("wallet-network").value;
  const addr = document.getElementById("wallet-address-input").value;

  const res = await fetch(`${API}/api/set_wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: uid, network: net, address: addr }),
  });

  const data = await res.json();
  if (data.ok) {
    alertTG("Wallet saved!");
    loadWalletInfo();
  }
}

function openEditWallet() {
  document.getElementById("wallet-attached").classList.add("hidden");
  document.getElementById("wallet-form").classList.remove("hidden");
}

// ---------------------- WITHDRAW ----------------------
async function sendWithdraw() {
  const uid = TG().initDataUnsafe.user.id;
  const amt = parseFloat(document.getElementById("withdraw-amount").value);

  const res = await fetch(`${API}/api/request_withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: uid, amount: amt }),
  });

  const data = await res.json();

  if (data.ok) alertTG("Withdraw request sent!");
  else if (data.error === "wallet_not_set") alertTG("Attach wallet first.");
  else if (data.error === "not_enough_balance") alertTG("Not enough balance.");
  else alertTG("Error.");
}

// ---------------------- TILE HANDLER ----------------------
function initTiles() {
  document.querySelectorAll(".tile").forEach((tile) => {
    tile.onclick = () => {
      const sec = tile.dataset.section;

      if (sec === "earn") earn();
      else if (sec === "wallet") openWallet();
      else if (sec === "friends") inviteFriends();
      else alertTG("Coming soon");
    };
  });
}

// ---------------------- INIT ----------------------
document.addEventListener("DOMContentLoaded", () => {
  initTG();
  initTon();
  initNav();
  initTiles();
  applyLang();

  loadBalance();

  document.getElementById("invite-btn").onclick = inviteFriends;
  document.getElementById("wallet-connect-btn").onclick = () =>
    tonUI.openModal();
});
