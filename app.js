// 0059Bot WebApp front-end
// Լեզուների պարզ համակարգ + կոճակների հենակետային ֆունկցիաներ

const translations = {
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

    btn_invite_friends: "INVITE FRIENDS",

    vip_title: "VIP TASKS",
    vip_subtitle: "Earn up to $20/day",

    nav_home: "Home",
    nav_activity: "Activity",
    nav_messages: "Messages",
    nav_settings: "Settings",
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

    btn_invite_friends: "ПРИГЛАСИТЬ ДРУЗЕЙ",

    vip_title: "VIP ЗАДАНИЯ",
    vip_subtitle: "До $20 в день",

    nav_home: "Главная",
    nav_activity: "Активность",
    nav_messages: "Сообщения",
    nav_settings: "Настройки",
  },
};

let currentLang = "en";

// TON CONNECT – wallet integration
let tonConnectUI = null;
let tonWallet = null; // այստեղ կպահենք միացված քաշելյոկի տվյալները

function initTonConnect() {
  if (!window.TON_CONNECT_UI) {
    console.log("TON_CONNECT_UI not found");
    return;
  }

  tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: "https://vorn-studio.github.io/0059bot/tonconnect-manifest.json"
  });

  // եթե արդեն միացված է, վերականգնենք վիճակը
  tonConnectUI.onStatusChange((wallet) => {
    tonWallet = wallet;
    updateWalletUI();
  });
}

function updateWalletUI() {
  const statusEl = document.getElementById("wallet-status");
  const addrEl = document.getElementById("wallet-address");

  if (!statusEl || !addrEl) return;

  if (!tonWallet) {
    statusEl.textContent = "Not connected";
    addrEl.textContent = "—";
  } else {
    statusEl.textContent = "Connected";
    const shortAddr = tonWallet.account.address.slice(0, 4) + "..." +
      tonWallet.account.address.slice(-4);
    addrEl.textContent = shortAddr;
  }
}

function openWalletConnect() {
  if (!tonConnectUI) return;
  tonConnectUI.openModal(); // բացում է wallet–ների ընտրության պատուհանը
}


// Պարզ թարգմանիչ
function applyTranslations() {
  const dict = translations[currentLang] || translations.en;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
}

// Լեզվի փոփոխություն (հետագայում կկապենք settings–ի հետ)
function setLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  applyTranslations();
  try {
    localStorage.setItem("lang_0059", lang);
  } catch (e) {}
}

// Կոճակների սեղմումներ
function handleTileClick(section) {
  // եթե wallet է, բացենք wallet էջը
  if (section === "wallet") {
    if (homePage) homePage.classList.add("hidden");
    if (settingsPage) settingsPage.classList.add("hidden");
    if (walletPage) walletPage.classList.remove("hidden");
    return;
  }

  // մնացածները – մինչև իսկական էջեր չունենք, թող մնա debug
  if (window.Telegram && Telegram.WebApp) {
    Telegram.WebApp.showAlert(`Section: ${section}`);
  } else {
    console.log("Open section:", section);
  }
}


function handleInviteClick() {
  if (window.Telegram && Telegram.WebApp) {
    const tg = Telegram.WebApp;
    if (tg.openTelegramLink && tg.initDataUnsafe?.user?.username) {
      const user = tg.initDataUnsafe.user.username;
      tg.openTelegramLink(`https://t.me/share/url?url=&text=Join%200059Bot%20with%20${user}`);
    } else {
      tg.showAlert("Invite friends feature will be added soon.");
    }
  }
}

function setupBottomNav() {
  const items = document.querySelectorAll(".nav-item");
  items.forEach((btn) => {
    btn.addEventListener("click", () => {
      items.forEach((b) => b.classList.remove("nav-item-active"));
      btn.classList.add("nav-item-active");
      const tab = btn.getAttribute("data-tab");
      console.log("Switch tab:", tab);

      // SETTINGS: բացել լեզվի մոդալը
      if (tab === "settings") {
        openLangModal();
      }
    });
  });
}


// Telegram WebApp init
function initTelegram() {
  if (!window.Telegram || !Telegram.WebApp) return;
  const tg = Telegram.WebApp;
  tg.expand(); // բացում է ամբողջ բարձրությամբ
  tg.enableClosingConfirmation();
  const user = tg.initDataUnsafe?.user;
  if (user && user.username) {
    console.log("User:", user.username);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Լեզու localStorage-ից
  try {
    const saved = localStorage.getItem("lang_0059");
    if (saved && translations[saved]) currentLang = saved;
  } catch (e) {}

  applyTranslations();
  setupBottomNav();
  initTelegram();

  initTonConnect();


  // Tile click handlers
  document.querySelectorAll(".tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const section = tile.getAttribute("data-section");
      handleTileClick(section);
    });
  });

  // Invite friends
  const inviteBtn = document.getElementById("invite-btn");
  if (inviteBtn) {
    inviteBtn.addEventListener("click", handleInviteClick);
  }

  // Ժամանակավոր balance placeholder
  const headerBalance = document.getElementById("header-balance");
  if (headerBalance) {
    headerBalance.textContent = "12 530";
  }

  // ԱՅՍ ՄԱՍԸ ԱՎԵԼԱՑՐՈՒ ԱՅՍՏԵՂ
  const walletConnectBtn = document.getElementById("wallet-connect-btn");
  if (walletConnectBtn) {
    walletConnectBtn.addEventListener("click", () => {
      openWalletConnect();
    });
  }
});




// Լեզվի ֆունկցիաները գցում ենք global, որ հետո կարանք կանչենք console–ից կամ settings–ից
window.setLanguage = setLanguage;

// SETTINGS PAGE LOGIC
// SETTINGS & WALLET PAGE LOGIC
const homePage = document.querySelector(".app-main");
const settingsPage = document.getElementById("settings-page");
const walletPage = document.getElementById("wallet-page");

const langRow = document.getElementById("lang-row");
const langDropdown = document.getElementById("lang-dropdown");
const currentLangText = document.getElementById("current-lang");

// ստորին մենյուի կոճակներ՝ Home / Activity / Messages / Settings
function setupBottomNav() {
  const items = document.querySelectorAll(".nav-item");

  items.forEach((btn) => {
    btn.addEventListener("click", () => {
      items.forEach((b) => b.classList.remove("nav-item-active"));
      btn.classList.add("nav-item-active");

      const tab = btn.getAttribute("data-tab");

      // default՝ ցույց տանք գլխավոր էջը
      if (homePage) homePage.classList.add("hidden");
      if (settingsPage) settingsPage.classList.add("hidden");
      if (walletPage) walletPage.classList.add("hidden");

      if (tab === "settings") {
        if (settingsPage) settingsPage.classList.remove("hidden");
      } else if (tab === "wallet") {
        if (walletPage) walletPage.classList.remove("hidden");
      } else {
        if (homePage) homePage.classList.remove("hidden");
      }
    });
  });
}


// բացել/փակել լեզվի dropdown-ը Settings էջում
if (langRow) {
  langRow.addEventListener("click", () => {
    if (langDropdown) {
      langDropdown.classList.toggle("hidden");
    }
  });
}

// Լեզվի label-ը Settings էջում
function updateCurrentLangLabel() {
  if (!currentLangText) return;
  currentLangText.textContent = currentLang === "ru" ? "Русский" : "English";
}

// dropdown-ից լեզու փոխելու helper
function changeLanguage(lang) {
  setLanguage(lang);           // օգտագործում ենք վերևի հիմնական ֆունկցիան
  updateCurrentLangLabel();    // թարմացնում ենք Settings-ի տեքստը

  if (langDropdown) {
    langDropdown.classList.add("hidden");
  }
}

// որ changeLanguage-ը աշխատի inline onclick-ից
window.changeLanguage = changeLanguage;

// էջը բեռնվելիս միանգամից ճիշտ տեքստը դնենք
updateCurrentLangLabel();

/* ================================
   REAL USDT BALANCE SYSTEM
   ================================ */

// Բալանս տանել էկրանին
function renderBalance(amount) {
    const el = document.getElementById("balanceAmount");
    if (el) {
        el.textContent = amount.toFixed(2) + " USDT";
    }
}

// Բերել բալանսը backend-ից
async function loadUserBalance() {
    try {
        const tg = window.Telegram?.WebApp;
        const userId = tg?.initDataUnsafe?.user?.id;

        if (!userId) return;

        const res = await fetch(`/api/get_balance?user_id=${userId}`);
        const data = await res.json();

        if (data.ok) {
            renderBalance(data.balance);
        }
    } catch (e) {
        console.error("Balance load failed:", e);
    }
}

// Ավելացնել եկամուտ (earn)
async function addEarn(amount) {
    try {
        const tg = window.Telegram?.WebApp;
        const userId = tg?.initDataUnsafe?.user?.id;
        if (!userId) return;

        const res = await fetch("/api/add_earn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, amount })
        });

        const data = await res.json();
        if (data.ok) {
            renderBalance(data.balance);
            Telegram.WebApp.showAlert(
                `+${amount.toFixed(2)} USDT\nNew balance: ${data.balance.toFixed(2)}`
            );
        }
    } catch (e) {
        console.error("addEarn failed:", e);
    }
}

// Էջի բացումից հետո բեռնում ենք բալանսը
document.addEventListener("DOMContentLoaded", () => {
    loadUserBalance();
});

// ------------------- WALLET LOGIC ----------------------

// const walletPage = document.getElementById("wallet-page");
const depositAddressBox = document.getElementById("deposit-address");

function openWallet() {
  homePage.classList.add("hidden");
  settingsPage.classList.add("hidden");
  walletPage.classList.remove("hidden");
  loadWalletBalance();
  loadWalletInfo();
}

window.openWallet = openWallet;

// Load balance
function loadWalletBalance() {
  const tg = Telegram.WebApp;
  const userId = tg.initDataUnsafe?.user?.id;

  fetch(`https://vorn-studio.github.io/your_server/api/get_balance?user_id=${userId}`)
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        document.getElementById("wallet-balance").textContent =
          data.balance.toFixed(2) + " USDT";
        document.getElementById("header-balance").textContent =
          data.balance.toFixed(2) + " USDT";
      }
    });
}

// Load wallet info
function loadWalletInfo() {
  const tg = Telegram.WebApp;
  const userId = tg.initDataUnsafe?.user?.id;

  fetch(`https://your_server/api/get_wallet?user_id=${userId}`)
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;

      if (data.address) {
        document.getElementById("wallet-attached").classList.remove("hidden");
        document.getElementById("wallet-form").classList.add("hidden");

        document.getElementById("wallet-network-text").textContent = data.network;
        document.getElementById("wallet-address-text").textContent = data.address;
      } else {
        document.getElementById("wallet-attached").classList.add("hidden");
        document.getElementById("wallet-form").classList.remove("hidden");
      }
    });
}

// Save wallet
function saveWallet() {
  const tg = Telegram.WebApp;
  const userId = tg.initDataUnsafe?.user?.id;
  const net = document.getElementById("wallet-network").value;
  const addr = document.getElementById("wallet-address").value;

  fetch(`https://your_server/api/set_wallet`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({user_id: userId, network: net, address: addr})
  })
    .then(r => r.json())
    .then(data => {
      if (data.ok) loadWalletInfo();
      else tg.showAlert("Error saving wallet");
    });
}

window.saveWallet = saveWallet;

function openEditWallet() {
  document.getElementById("wallet-attached").classList.add("hidden");
  document.getElementById("wallet-form").classList.remove("hidden");
}

window.openEditWallet = openEditWallet;

// Withdraw request
function sendWithdraw() {
  const tg = Telegram.WebApp;
  const userId = tg.initDataUnsafe?.user?.id;
  const amt = parseFloat(document.getElementById("withdraw-amount").value);

  fetch(`https://your_server/api/request_withdraw`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({user_id: userId, amount: amt})
  })
    .then(r => r.json())
    .then(data => {
      if (data.ok) tg.showAlert("Withdraw request sent!");
      else {
        if (data.error === "wallet_not_set") tg.showAlert("Attach your wallet first");
        else if (data.error === "not_enough_balance") tg.showAlert("Not enough balance");
        else tg.showAlert("Error: " + data.error);
      }
    });
}

window.sendWithdraw = sendWithdraw;

// Deposit info
function depositInfo() {
  Telegram.WebApp.showAlert("We will verify your deposit in 3–10 minutes");
}

window.depositInfo = depositInfo;
