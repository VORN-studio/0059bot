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
  // Այստեղ հետո կկապենք իրական էջերի / մոդալների հետ.
  // Մինչև backend ունենալը ուղարկում ենք telegram alert
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
});



// Լեզվի ֆունկցիաները գցում ենք global, որ հետո կարանք կանչենք console–ից կամ settings–ից
window.setLanguage = setLanguage;


function openLangModal() {
  document.getElementById("lang-modal").classList.remove("hidden");
}

function closeLangModal() {
  document.getElementById("lang-modal").classList.add("hidden");
}

// SETTINGS PAGE LOGIC
const homePage = document.querySelector(".app-main");
const settingsPage = document.getElementById("settings-page");
const langRow = document.getElementById("lang-row");
const langDropdown = document.getElementById("lang-dropdown");
const currentLangText = document.getElementById("current-lang");

document.querySelector('[data-tab="settings"]').addEventListener("click", () => {
    homePage.classList.add("hidden");
    settingsPage.classList.remove("hidden");
});

document.querySelector('[data-tab="home"]').addEventListener("click", () => {
    settingsPage.classList.add("hidden");
    homePage.classList.remove("hidden");
});

langRow.addEventListener("click", () => {
    langDropdown.classList.toggle("hidden");
});

function setLanguage(lang) {
    localStorage.setItem("lang", lang);
    currentLangText.textContent = lang === "en" ? "English" : "Русский";
    langDropdown.classList.add("hidden");
}

// LOAD SAVED LANGUAGE
const saved = localStorage.getItem("lang");
if (saved) {
    currentLangText.textContent = saved === "en" ? "English" : "Русский";
}
