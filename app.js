// =========================
// Language system (EN / RU)
// =========================

let currentLang = "en";

const translations = {
    en: {
        balance_label: "BALANCE",
        earnings_label: "Earnings:",
        earnings_value: "+$0.00 / hour",
        today_label: "Today:",
        btn_earn: "Earn",
        btn_invite: "Invite",
        btn_withdraw: "Withdraw",
        btn_upgrades: "Upgrades",
        tasks_title: "Tasks",
        task_click: "Click to Earn",
        task_auto: "Auto-Earn",
        task_tasks: "Tasks"
    },
    ru: {
        balance_label: "БАЛАНС",
        earnings_label: "Доход:",
        earnings_value: "+$0.00 / час",
        today_label: "Сегодня:",
        btn_earn: "Заработать",
        btn_invite: "Пригласить",
        btn_withdraw: "Вывод",
        btn_upgrades: "Улучшения",
        tasks_title: "Задания",
        task_click: "Клик чтобы зарабатывать",
        task_auto: "Авто-заработок",
        task_tasks: "Задания"
    }
};

function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem("lang_0059", lang);

    const dict = translations[lang] || translations.en;

    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.dataset.i18n;
        if (dict[key]) {
            el.textContent = dict[key];
        }
    });

    const flagEl = document.getElementById("langFlag");
    if (flagEl) {
        flagEl.textContent = lang === "en" ? "🇺🇸" : "🇷🇺";
    }
}

function initLanguage() {
    const saved = localStorage.getItem("lang_0059") || "en";
    applyLanguage(saved);

    const langToggle = document.getElementById("langToggle");
    if (langToggle) {
        langToggle.addEventListener("click", () => {
            const next = currentLang === "en" ? "ru" : "en";
            applyLanguage(next);
        });
    }
}

// =========================
// Stub handlers (later logic)
// =========================

function onEarn() {
    alert(currentLang === "ru" ? "Раздел заработка скоро будет доступен." : "Earn section coming soon.");
}

function onInvite() {
    alert(currentLang === "ru" ? "Раздел приглашений скоро будет доступен." : "Invite section coming soon.");
}

function onWithdraw() {
    alert(currentLang === "ru" ? "Вывод скоро будет доступен." : "Withdraw section coming soon.");
}

function onUpgrades() {
    alert(currentLang === "ru" ? "Улучшения скоро будут доступны." : "Upgrades section coming soon.");
}

function onClickToEarn() {
    alert(currentLang === "ru" ? "Клик чтобы зарабатывать – скоро." : "Click to Earn coming soon.");
}

function onAutoEarn() {
    alert(currentLang === "ru" ? "Авто-заработок – скоро." : "Auto-Earn coming soon.");
}

function onOpenTasks() {
    alert(currentLang === "ru" ? "Список заданий скоро будет доступен." : "Tasks list coming soon.");
}

// Init after load
document.addEventListener("DOMContentLoaded", initLanguage);
