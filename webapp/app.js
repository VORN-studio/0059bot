// ========== Mobile Auto-Optimization ==========
function isMobileOrLowEnd() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isLowEnd = navigator.deviceMemory ? navigator.deviceMemory < 4 : false;
  const isFewCores = navigator.hardwareConcurrency ? navigator.hardwareConcurrency < 4 : false;
  
  return isMobile || isLowEnd || isFewCores;
}

function disableHeavyAnimations() {
  try { document.body.classList.add('lowperf'); } catch(_){ }
}

if (isMobileOrLowEnd()) {
  console.log('📱 Mobile detected. Performance mode enabled.');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableHeavyAnimations);
  } else {
    disableHeavyAnimations();
  }
}

const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: `${window.location.origin}/webapp/tonconnect-manifest.json`,
  buttonRootId: "ton-connect",
});

let TON_WALLET = null;

function showSuccessModal(title, message) {
  const modal = document.getElementById("success-modal");
  modal.querySelector(".modal-title").textContent = title;
  modal.querySelector(".modal-message").textContent = message;
  modal.style.display = "flex";
}

function closeSuccessModal() {
  document.getElementById("success-modal").style.display = "none";
}

async function checkUsernameAvailable(name){
  try {
    const q = encodeURIComponent(name);
    const res = await fetch(`/api/search_users?q=${q}&viewer=${CURRENT_USER_ID}`);
    const d = await res.json();
    if (d.ok && Array.isArray(d.users)) {
      const taken = d.users.some(u => String(u.username||"").toLowerCase() === name.toLowerCase() && Number(u.user_id) !== Number(CURRENT_USER_ID));
      return !taken;
    }
  } catch(_){ }
  return true;
}

function hasUsernameFlag(){
  try { return localStorage.getItem('username_set_' + String(CURRENT_USER_ID)) === '1'; } catch(_){ return false; }
}

function setUsernameFlag(){
  try { localStorage.setItem('username_set_' + String(CURRENT_USER_ID), '1'); } catch(_){ }
}

function getStoredUsername(){
  try { return localStorage.getItem('uname_' + String(CURRENT_USER_ID)) || ""; } catch(_){ return ""; }
}

function setStoredUsername(name){
  try { localStorage.setItem('uname_' + String(CURRENT_USER_ID), name); } catch(_){ }
}

// Функция для обновления ежедневного бонуса
function updateDailyBonus() {
  if (!CURRENT_USER_ID) return;
  
  const today = new Date().toDateString();
  const lastVisit = localStorage.getItem(`last_visit_${CURRENT_USER_ID}`);
  const bonusClaimed = localStorage.getItem(`daily_bonus_${CURRENT_USER_ID}`) === 'true';
  
  const bonusText = document.getElementById("daily-bonus-text");
  const bonusBtn = document.getElementById("daily-bonus-btn");
  
  if (!bonusText || !bonusBtn) return;
  
  if (lastVisit === today && bonusClaimed) {
    bonusText.textContent = "Бонус уже получен сегодня. Приходите завтра!";
    bonusBtn.style.display = "none";
  } else {
    bonusText.textContent = "Получите 0.50 DOMIT ежедневный бонус!";
    bonusBtn.style.display = "inline-block";
  }
}

// Функция для получения ежедневного бонуса
async function claimDailyBonus() {
  if (!CURRENT_USER_ID) {
    alert("❌ Откройте приложение из Telegram бота!");
    return;
  }
  
  const today = new Date().toDateString();
  const bonusClaimed = localStorage.getItem(`daily_bonus_${CURRENT_USER_ID}`) === 'true';
  
  if (bonusClaimed) {
    alert("❌ Бонус уже получен сегодня!");
    return;
  }
  
  const bonusBtn = document.getElementById("daily-bonus-btn");
  const bonusText = document.getElementById("daily-bonus-text");
  
  bonusBtn.textContent = "⏳ Загрузка...";
  bonusBtn.disabled = true;
  
  try {
    const res = await fetch(`${API_BASE}/api/daily_bonus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: CURRENT_USER_ID })
    });
    
    const data = await res.json();
    
    if (data.ok) {
      localStorage.setItem(`daily_bonus_${CURRENT_USER_ID}`, 'true');
      localStorage.setItem(`last_visit_${CURRENT_USER_ID}`, today);
      
      bonusText.textContent = "✅ Бонус получен! +0.50 DOMIT";
      bonusBtn.style.display = "none";
      
      // Обновляем баланс
      balance += 0.50;
      updateBalanceDisplay();
      
      alert("✅ Ежедневный бонус 0.50 DOMIT получен!");
    } else {
      bonusBtn.textContent = "Получить бонус";
      bonusBtn.disabled = false;
      alert("❌ " + (data.message || "Ошибка при получении бонуса"));
    }
  } catch (error) {
    console.error("Daily bonus error:", error);
    bonusBtn.textContent = "Получить бонус";
    bonusBtn.disabled = false;
    alert("❌ Ошибка сервера. Попробуйте позже.");
  }
}

function showUsernameModal(){
  const m = $("username-modal");
  const i = $("username-input");
  const e = $("username-error");
  const b = $("username-save-btn");
  if (!m || !b) return;
  m.style.display = "flex";
  if (e) e.textContent = "";
  if (i) i.value = "";
  b.onclick = async function(){
    const name = i && i.value ? i.value.trim() : "";
    if (!name || name.length < 3){ if (e) e.textContent = "Имя пользователя должно содержать не менее 3 символов."; return; }
    const ok = await checkUsernameAvailable(name);
    if (!ok){ if (e) e.textContent = "Это имя уже занято."; return; }
    const r = await fetch(`/api/set_username`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: CURRENT_USER_ID, username: name }) });
    try { await r.json(); } catch(_){ }
    $("user-name").textContent = name;
    setUsernameFlag();
    setStoredUsername(name);
    m.style.display = "none";
  };
}

async function attemptSetUsername(name){
  const ok = await checkUsernameAvailable(name);
  if (!ok){ showUsernameModal(); return; }
  try {
    const r = await fetch(`/api/set_username`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: CURRENT_USER_ID, username: name }) });
    try { await r.json(); } catch(_){ }
    $("user-name").textContent = name;
    setUsernameFlag();
    setStoredUsername(name);
  } catch(_){ showUsernameModal(); }
}

// Function to save wallet to backend
async function saveWalletToBackend() {
  if (!TON_WALLET || !CURRENT_USER_ID) {
    console.log("⏳ Waiting for both wallet and user ID...");
    return;
  }

  console.log("💾 Saving wallet to backend:", TON_WALLET);
  
  try {
    const res = await fetch(`${API_BASE}/api/wallet_connect`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({user_id: CURRENT_USER_ID, wallet: TON_WALLET})
    });
    const data = await res.json();
    
    if (data.ok) {
      console.log("✅ Wallet saved successfully:", data);
      const walletStatus = document.getElementById("wallet-status");
      if (walletStatus) {
        const short = TON_WALLET.slice(0, 6) + "..." + TON_WALLET.slice(-4);
        walletStatus.textContent = "✅ Wallet connected: " + short;
      }
    } else {
      console.error("❌ Wallet save failed:", data);
    }
  } catch (e) {
    console.error("❌ Wallet save error:", e);
  }
}

tonConnectUI.onStatusChange((walletInfo) => {
  if (walletInfo && walletInfo.account) {
    TON_WALLET = walletInfo.account.address;
    console.log("💎 TON Wallet Connected:", TON_WALLET);

    const walletStatus = document.getElementById("wallet-status");
    if (walletStatus) {
      const short = TON_WALLET.slice(0, 6) + "..." + TON_WALLET.slice(-4);
      walletStatus.textContent = "Wallet connected: " + short;
    }

    // Try to save immediately
    saveWalletToBackend();
  }
});

console.log("✅ Casino WebApp loaded");
const tg = window.Telegram && window.Telegram.WebApp;
// 🔗 Telegram deep-link support
const urlParams = new URLSearchParams(window.location.search);

const START_PARAM =
  urlParams.get("tgWebAppStartParam") ||
  (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ||
  null;

console.log("🔗 START_PARAM =", START_PARAM);

const API_BASE = window.location.origin;
let CURRENT_USER_ID = null;
let CURRENT_USERNAME = null;
let balance = 0.0;

function $(id) {
  return document.getElementById(id);
}

function updateUserHeader() {
  if ($("user-id")) $("user-id").textContent = CURRENT_USER_ID ?? "-";
  if ($("user-name")) $("user-name").textContent = CURRENT_USERNAME ?? "-";
}

function updateBalanceDisplay() {
  const el = $("user-balance");
  if (el) el.textContent = balance.toFixed(3) + " DOMIT";
}

async function loadMiningPlans() {
    try {
        const res = await fetch(`${API_BASE}/api/mining/plans`);
        const data = await res.json();

        if (!data.ok || !Array.isArray(data.plans)) return;

        const box = document.getElementById("mining-plans-box");
        if (!box) return;
        box.innerHTML = "";

        data.plans.forEach(plan => {
            const priceDomit = Number(plan.price_usd);          
            const speedDomitHr = Number(plan.domit_per_hour);   

            const el = document.createElement("div");
            el.className = "plan-card";
            el.innerHTML = `
                <div class="plan-title">${plan.name}</div>
                <div class="plan-price">${priceDomit.toFixed(2)} DOMIT</div>
                <div class="plan-speed">${speedDomitHr.toFixed(2)} DOMIT/hr</div>
                <button class="btn buy-btn" data-plan-id="${plan.id}">
                  Купить
                </button>
            `;
            box.appendChild(el);
        });

        document.querySelectorAll(".buy-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const planId = btn.getAttribute("data-plan-id");
                buyMiningPlan(planId);
            });
        });
    } catch (err) {
        console.log("❌ loadMiningPlans error", err);
    }
}



async function loadMiningState() {
    if (!CURRENT_USER_ID) return;

    try {
        const res = await fetch(`${API_BASE}/api/mining/state/${CURRENT_USER_ID}`);
        const data = await res.json();

        const box = document.getElementById("mining-active-box");
        if (!box) return;

        if (!data.ok || !data.state) {
            box.style.display = "none";
            return;
        }

        box.style.display = "block";

        const st = data.state;
        document.getElementById("mining-active-tier").textContent = st.tier;
        document.getElementById("mining-active-speed").textContent = st.speed.toFixed(2);
        document.getElementById("mining-active-earned").textContent = st.earned.toFixed(2);
    } catch (err) {
        console.log("❌ loadMiningState error", err);
    }
}

const tgParam = new URLSearchParams(window.location.search)
    .get("tgWebAppStartParam");

if (tgParam && tgParam.startsWith("post_")) {
    const postId = tgParam.replace("post_", "");
}


async function loadFakeHistory() {
  const box = document.getElementById("fake-history-list");
  if (!box) return;
  
  try {
    const uidParam = CURRENT_USER_ID ? `?uid=${CURRENT_USER_ID}` : "";
    const res = await fetch(`${API_BASE}/api/fake_history${uidParam}`);
    const data = await res.json();
    if (data.ok && Array.isArray(data.history)) {
      if (data.history.length === 0) {
        box.innerHTML = "<p>Нет недавних транзакций</p>";
        return;
      }
      box.innerHTML = "";
      data.history.forEach(item => {
        const row = document.createElement("div");
        row.style.marginBottom = "4px";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        
        const typeIcon = item.type === 'withdraw' ? '🔴' : '🟢';
        const color = item.type === 'withdraw' ? '#ff6b6b' : '#51cf66';
        
        row.innerHTML = `
          <span>${typeIcon} ${item.user}</span>
          <span style="color:${color}; font-weight:bold;">${item.amount} DOMIT</span>
        `;
        box.appendChild(row);
      });
    }
  } catch (e) {
    // console.error("Fake history error", e);
  }
}

async function buyMiningPlan(planId) {
    if (!CURRENT_USER_ID) return;

    try {
        const res = await fetch(`${API_BASE}/api/mining/buy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: CURRENT_USER_ID,
                plan_id: Number(planId)   
            })
        });

        const data = await res.json();

        if (!data.ok) {
            if (tg) {
                let msg = "❌ " + (data.error || "Произошла ошибка.");
                if (data.error === "low_balance") {
                    msg = "❌ У вас недостаточно DOMIT для этого пакета.";
                }
                tg.showPopup({ message: msg });
            }
            return;
        }

        if (tg) tg.showPopup({ message: "✅ Пакет активирован" });

        if (data.user) {
            balance = data.user.balance_usd;
            updateBalanceDisplay();
        }

        loadMiningState();
    } catch (err) {
        console.log("❌ buyMiningPlan error", err);
        if (tg) tg.showPopup({ message: "❌ Ошибка сервера" });
    }
}

document.getElementById("mining-claim-btn")
    .addEventListener("click", async () => {

    if (!CURRENT_USER_ID) return;

    try {
        const res = await fetch(`${API_BASE}/api/mining/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: CURRENT_USER_ID })
        });

        const data = await res.json();

        if (!data.ok) {
            if (tg) tg.showPopup({ message: "❌ " + data.error });
            return;
        }

        if (data.user) {
            balance = data.user.balance_usd;
        } else if (typeof data.new_balance_usd === "number") {
            balance = data.new_balance_usd;
        }
        updateBalanceDisplay();

        const claimedDomit = data.claimed_usd || 0;
        if (tg) {
            tg.showPopup({
                message: `✅ ${claimedDomit.toFixed(2)} DOMIT переведено на ваш баланс`
            });
        }

        loadMiningState();
    } catch (err) {
        console.log("❌ loadMiningState error", err);
        if (tg) tg.showPopup({ message: "❌ Ошибка сервера" });
    }
});


async function loadTonRate() {
    try {
        const res = await fetch(`${API_BASE}/api/ton_rate`);
        const data = await res.json();

        if (data.ok) {
            const rate = data.ton_usd;

            document.getElementById("ton-current").textContent = rate.toFixed(4);
        } else {
            document.getElementById("ton-current").textContent = "—";
        }
    } catch (e) {
        document.getElementById("ton-current").textContent = "—";
    }
}

function showPortalNotification() {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        font-weight: bold;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(238, 90, 36, 0.4);
        animation: slideDown 0.3s ease-out;
        max-width: 90%;
        text-align: center;
    `;
    notification.innerHTML = '🚫 Portal временно недоступен. Повторите попытку позже.';
    
    // Add animation keyframes if not exists
    if (!document.getElementById('portal-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'portal-notification-styles';
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            @keyframes slideUp {
                from {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}
async function openPortal() {
    if (!window.Telegram.WebApp.initDataUnsafe.user) return;

    // Always show portal closed notification
    showPortalNotification();
    return;
}


function openTasks() {
    const url = "/webapp/tasks/index.html?uid=" + CURRENT_USER_ID;
    if (window.Telegram && Telegram.WebApp) {
        window.location.href = url;  
        return;
    }
    window.location.href = url;
}

function initFromTelegram() {
  if (!tg) {
    console.log("⚠️ Telegram WebApp object нет (открыто в браузере)");
    updateUserHeader();
    updateBalanceDisplay();
    return;
  }

  tg.ready();
  tg.expand();

  // Poll for fake history
  setInterval(loadFakeHistory, 5000);
  loadFakeHistory();

  console.log("ℹ️ tg.initDataUnsafe =", tg.initDataUnsafe);

  const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (user) {
    CURRENT_USER_ID = user.id;
    CURRENT_USERNAME =
      user.first_name + (user.username ? " (@" + user.username + ")" : "");
    
    // Try to save wallet if already connected
    saveWalletToBackend();
  } else {
    console.log("⚠️ user object нет от initDataUnsafe");
  }

  // 🧠 save deep-linked post for portal
  if (START_PARAM && START_PARAM.startsWith("post_")) {
    window.DEEP_LINK_POST_ID = START_PARAM.replace("post_", "");
    console.log("📌 Deep link post id:", window.DEEP_LINK_POST_ID);
  }

  updateUserHeader();
  updateBalanceDisplay();
  loadUserFromBackend();
}

document.querySelector(".top h1").addEventListener("click", async () => {
    if (!CURRENT_USER_ID) return;
    
    // Always show portal closed notification
    showPortalNotification();
    return;
});


async function loadUserFromBackend() {
  if (!CURRENT_USER_ID) {
    console.log("⛔ CURRENT_USER_ID нет");
    return;
  }

  const url = `${API_BASE}/api/user/${CURRENT_USER_ID}`;
  console.log("🌐 Загрузка пользовательских данных:", url);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.user) {
      console.log("⚠️ user not found");
      alert("❌ Пользователь не найден. Попробуйте перезапустить приложение.");
      return;
    }

    // Проверяем, новый ли пользователь
    const U = data.user;
    const today = new Date().toDateString();
    const lastVisit = localStorage.getItem(`last_visit_${CURRENT_USER_ID}`);
    
    if (lastVisit !== today) {
      // Новый день - сбрасываем бонус
      localStorage.setItem(`last_visit_${CURRENT_USER_ID}`, today);
      localStorage.setItem(`daily_bonus_${CURRENT_USER_ID}`, 'false');
      console.log("🗓️ Новый день для пользователя:", CURRENT_USER_ID);
    }

    console.log("🔍 DEBUG: U.ref_count =", U.ref_count);
    console.log("🔍 DEBUG: element exists?", $("ref-total"));

    // Обновляем ежедневный бонус
    updateDailyBonus();

    $("user-id").textContent = CURRENT_USER_ID;
    $("user-name").textContent = U.username || "-";
    $("user-balance").textContent = U.balance_usd.toFixed(3) + " DOMIT";
    balance = U.balance_usd;
    if (document.getElementById("ton-current")) {
      document.getElementById("ton-current").textContent = U.ton_balance.toFixed(4);
    }

    if ($("ref-total")) {
      $("ref-total").textContent = U.ref_count;
      console.log("✅ ref-total обновлено:", U.ref_count);
    }
    if ($("ref-active")) $("ref-active").textContent = U.active_refs;
    if ($("ref-deposits")) $("ref-deposits").textContent = U.team_deposit_usd.toFixed(2) + " DOMIT";

    const botUsername = "doominobot";
    $("ref-link").value =
      `https://t.me/${botUsername}?start=ref_${CURRENT_USER_ID}`;

    console.log("✔ User loaded OK");

    const teleU = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.username;
    if (teleU && String(teleU).trim() !== "") {
      if (U.username !== teleU) {
        await attemptSetUsername(teleU);
      }
      $("user-name").textContent = teleU;
    } else {
      if (U.username && String(U.username).trim() !== "") {
        $("user-name").textContent = U.username;
      } else {
        const ls = getStoredUsername();
        if (ls && ls.trim() !== "") {
          $("user-name").textContent = ls;
          await attemptSetUsername(ls);
        } else {
          showUsernameModal();
        }
      }
    }

  } catch (err) {
    console.log("❌ loadUser error:", err);
  }
}



function openCrash() {
    window.location.href = `/webapp/games/crash.html?uid=${CURRENT_USER_ID}`;
}
function openDice() {
    window.location.href = `/webapp/games/dice.html?uid=${CURRENT_USER_ID}`;
}
function openSlots() {
    showLockedGame('Slots');
}

function openCoinflip() {
    showLockedGame('Coinflip');
}

function showLockedGame(gameName) {
    const msgBox = document.getElementById('locked-game-msg');
    const title = document.getElementById('locked-game-title');
    title.textContent = gameName;
    msgBox.style.display = 'block';
    setTimeout(() => { msgBox.style.display = 'none'; }, 4000);
}



function openMining() {
    window.location.href = `/webapp/mining/index.html?uid=${CURRENT_USER_ID}`;
}
const buttons = document.querySelectorAll(".btn[data-section]");
const screens = document.querySelectorAll(".screen");

function showScreen(name) {
  screens.forEach((s) => s.classList.remove("active"));
  const screen = $("screen-" + name);
  if (screen) screen.classList.add("active");

}




buttons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const section = btn.getAttribute("data-section");
    showScreen(section);
  });
});

const walletInput = $("wallet-input");
const walletStatus = $("wallet-status");
const walletSaveBtn = $("wallet-save-btn");

if (walletSaveBtn) {
  walletSaveBtn.addEventListener("click", async () => {
    const value = walletInput.value.trim();
    if (!value) {
      walletStatus.textContent = "Пожалуйста, введите адрес вашего кошелька.։";
      return;
    }
    if (!CURRENT_USER_ID) {
      walletStatus.textContent = "Идентификатор пользователя Telegram не найден. Открытие из бота, а не из браузера.։";
      return;
    }

    walletStatus.textContent = "Сохраняем wallet…";

    const url = `${API_BASE}/api/wallet_connect`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: CURRENT_USER_ID,
          wallet: value,
        }),
      });

      if (!res.ok) {
        walletStatus.textContent = "Ошибка на стороне бэкэнда (проверю позже)։";
        return;
      }

      const data = await res.json();
      if (data.ok) {
        walletStatus.textContent =
          "Счет в кошельке успешно сохранен. Бонус будет зачислен в админку. 💰";
        if (data.user && typeof data.user.balance === "number") {
          balance = data.user.balance;
          updateBalanceDisplay();
        }
      } else {
        walletStatus.textContent =
          data.error || "Не удалось сохранить кошелек (ответ бэкэнда)։";
      }
    } catch (err) {
      console.log("❌ Wallet save error:", err);
      walletStatus.textContent =
        "Не удалось подключиться к серверу. Пожалуйста, попробуйте позже.։";
    }
  });
}
const depositInput = $("deposit-amount");
const depositStatus = $("deposit-status");
const depositBtn = $("deposit-btn");

if (depositBtn) {
  depositBtn.addEventListener("click", async () => {

    const amount = Number(depositInput.value);
    if (!amount || amount <= 0) {
      depositStatus.textContent = "Укажите правильное количество тонн։";
      return;
    }

    if (!TON_WALLET) {
      depositStatus.textContent = "Подключите свой кошелек TON.։";
      return;
    }

    depositStatus.textContent = "Открытие всплывающего окна оплаты TON…";

    const RECEIVER_TON_ADDRESS = "UQC0hJAYzKWuRKVnUtu_jeHgbyxznehBllc63azIdeoPUBfW"; 

  try {
    async function sendTonTx() {
      return tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        messages: [
          { address: RECEIVER_TON_ADDRESS, amount: (amount * 1e9).toString() }
        ]
      });
    }

    let result;
    try {
      result = await sendTonTx();
    } catch (e1) {
      try { result = await sendTonTx(); } catch (e2) {
        const nano = Math.round(amount * 1e9);
        const fallback = `ton://transfer/${RECEIVER_TON_ADDRESS}?amount=${nano}`;
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
          window.Telegram.WebApp.openLink(fallback);
        } else {
          window.open(fallback, "_blank");
        }
        if (window.confirm("Вы отправили платеж на адрес, указанный в Кошельке?")) {
          result = { boc: "" };
        } else {
          depositStatus.textContent = "Проверка кошелька не удалась. Пожалуйста, попробуйте еще раз.";
          return;
        }
      }
    }

    console.log("TON Transaction:", result);

    depositStatus.textContent =
      "Депозит отправлен.։ Tx hash: " + result.boc.slice(0, 10) + "...";

    const r = await fetch(`${API_BASE}/api/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: CURRENT_USER_ID, amount })
    });
    const d = await r.json();
    if (!d.ok) {
      depositStatus.textContent = "❌ " + (d.message || d.error || "Произошла ошибка.");
    } else {
      depositStatus.textContent = "✅ " + (d.message || "Зарегистрированный депозит");
      if (d.user) {
        balance = d.user.balance_usd;
        updateBalanceDisplay();
        const rt = document.getElementById("ref-total");
        const ra = document.getElementById("ref-active");
        const rd = document.getElementById("ref-deposits");
        if (rt) rt.textContent = d.user.ref_count;
        if (ra) ra.textContent = d.user.active_refs;
        if (rd) rd.textContent = d.user.team_deposit_usd.toFixed(2) + " DOMIT";
      }
    }

  } catch (err) {
    console.log("❌ TON popup error:", err);
    depositStatus.textContent = "Пользователь отменил заказ или произошла ошибка։";
  }
  });
}

const withdrawInput = $("withdraw-amount");
const withdrawStatus = $("withdraw-status");
const withdrawBtn = $("withdraw-btn");
const promoInput = $("promo-code");
const promoBtn = $("promo-btn");

if (withdrawBtn) {
  withdrawBtn.addEventListener("click", () => {

    const amount = Number(withdrawInput.value);

    if (!amount || amount <= 0) {
      withdrawStatus.textContent = "❌ Укажите сумму правильно։";
      return;
    }

    if (!CURRENT_USER_ID) {
      withdrawStatus.textContent = "❌ Откройте веб-приложение из самого бота, а не из браузера.";
      return;
    }

    if (amount > balance) {
      withdrawStatus.textContent = "❌ Введенная вами сумма превышает ваш баланс.";
      return;
    }

    const refActive = Number($("ref-active").textContent) || 0;
    const refDeposits = Number(
      ($("ref-deposits").textContent || "0").replace("$", "")
    );

    if (refActive < 5 || refDeposits < 5) {
      withdrawStatus.innerHTML =
        "❌ Не удалось снять наличные..<br><br>" +
        "• Требуется не менее 5 активных приглашенных пользователей.<br>" +
        "• Для вывода средств сумма депозитов рефералов должна быть не менее 5 DOMIT. Это подтверждает их активность и защищает систему от фейков.<br>" +
        "• Сумма не может превышать остаток на счете.";
      return;
    }

    withdrawStatus.textContent = "⏳ Проверка…";

    fetch(`${API_BASE}/api/withdraw_request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: CURRENT_USER_ID,
        amount: amount
      })
    })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) {
        withdrawStatus.textContent = "❌ " + (data.message || "Произошла ошибка.");
      } else {
        withdrawStatus.textContent = "✅ " + data.message;

        if (data.user) {
          balance = data.user.balance_usd;
          updateBalanceDisplay();
          $("ref-total").textContent = data.user.ref_count;
          $("ref-active").textContent = data.user.active_refs;
          $("ref-deposits").textContent = data.user.team_deposit_usd.toFixed(2) + " DOMIT";
        }
      }
    })
    .catch(err => {
      withdrawStatus.textContent = "❌ Ошибка сервера";
      console.error(err);
    });


  });
}

if (promoBtn) {
  promoBtn.addEventListener("click", async () => {
    const code = (promoInput && promoInput.value || "").trim();
    if (!code) {
      withdrawStatus.textContent = "❌ Введите промокод правильно.";
      return;
    }
    if (!CURRENT_USER_ID) {
      withdrawStatus.textContent = "❌ Откройте веб-приложение из самого бота, а не из браузера.";
      return;
    }
    withdrawStatus.textContent = "⏳ Проверка промокода…";
    try {
      const r = await fetch(`${API_BASE}/api/promocode/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: CURRENT_USER_ID, code })
      });
      const d = await r.json();
      if (!d.ok) {
        withdrawStatus.textContent = "❌ " + (d.message || d.error || "Промокод недействителен.");
      } else {
        const gained = Number(d.amount || 0).toFixed(2);
        withdrawStatus.textContent = `✅ Промокод активирован. +${gained} DOMIT`;
        if (d.user && typeof d.user.balance_usd === "number") {
          balance = d.user.balance_usd;
          updateBalanceDisplay();
          const rt = document.getElementById("ref-total");
          const ra = document.getElementById("ref-active");
          const rd = document.getElementById("ref-deposits");
          if (rt && typeof d.user.ref_count !== "undefined") rt.textContent = d.user.ref_count;
          if (ra && typeof d.user.active_refs !== "undefined") ra.textContent = d.user.active_refs;
          if (rd && typeof d.user.team_deposit_usd !== "undefined") rd.textContent = d.user.team_deposit_usd.toFixed(2) + " DOMIT";
        }
      }
    } catch (err) {
      withdrawStatus.textContent = "❌ Ошибка сервера";
      console.error(err);
    }
  });
}

const refLinkInput = $("ref-link");
const refCopyBtn = $("ref-copy-btn");

function initReferralLink() {
  if (!refLinkInput) return;

  if (CURRENT_USER_ID) {
    const botUsername = "doominobot"; 
    const link = `https://t.me/${botUsername}?start=ref_${CURRENT_USER_ID}`;
    refLinkInput.value = link;
  } else {
    refLinkInput.value =
      "Нет идентификатора пользователя (тестирование вне веб-приложения Telegram)";
  }
}

if (refCopyBtn) {
  refCopyBtn.addEventListener("click", () => {
    if (!refLinkInput) return;
    refLinkInput.select();
    document.execCommand("copy");
    showSuccessModal("✅ Сделанный", "Ссылка скопирована в память");
  });
}

initFromTelegram();
initReferralLink();
updateBalanceDisplay();

function initEffectObserver() {
  if (!('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll(
    '.screen, .task-card, .task-btn, #app .inner-ring, #app .glass-reflect, #app .noise-overlay, #app .corner-node'
  );
  if (!targets || targets.length === 0) return;
  const io = new IntersectionObserver(function(entries) {
    entries.forEach(function(e){
      if (e.isIntersecting) {
        e.target.classList.remove('effect-off');
      } else {
        e.target.classList.add('effect-off');
      }
    });
  }, { threshold: 0.01 });
  targets.forEach(function(t){ io.observe(t); });
}

// ═══════════════════════════════════════════
// DOMIT/TON CHART (Lightweight Charts)
// ═══════════════════════════════════════════

let domitChart;
let domitCandleSeries;

let chartVisible = true;
let throttleMs = isMobileOrLowEnd() ? 360 : 120;
let lastUpdateTs = 0;
let pendingUpdateTimer = null;
let latestDomitData = null;

function applyDomitUpdate(data) {
  domitCandleSeries.update(data);
  lastCandleTime = data.time;

  const currentEl = document.getElementById('domit-current');
  if (currentEl) {
    currentEl.textContent = Number(data.close).toFixed(4);
  }

  const changeEl = document.getElementById('domit-change');
  if (changeEl && window.firstCandleOpen) {
    const change = ((data.close - window.firstCandleOpen) / window.firstCandleOpen * 100).toFixed(2);
    changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
    changeEl.style.color = change >= 0 ? '#26a69a' : '#ef5350';
  }
}

function scheduleDomitUpdate(data) {
  latestDomitData = data;
  if (!chartVisible || !domitCandleSeries || scrollingNow) return;
  const now = Date.now();
  const dueIn = throttleMs - (now - lastUpdateTs);
  if (dueIn <= 0) {
    lastUpdateTs = now;
    applyDomitUpdate(latestDomitData);
    latestDomitData = null;
    if (pendingUpdateTimer) { clearTimeout(pendingUpdateTimer); pendingUpdateTimer = null; }
  } else if (!pendingUpdateTimer) {
    pendingUpdateTimer = setTimeout(function() {
      pendingUpdateTimer = null;
      if (chartVisible && domitCandleSeries && latestDomitData) {
        lastUpdateTs = Date.now();
        applyDomitUpdate(latestDomitData);
        latestDomitData = null;
      }
    }, dueIn);
  }
}

function loadDomitChart() {
  const container = document.getElementById('domit-chart');

  if (!container) {
    console.error('❌ domit-chart element not found');
    return;
  }

  const width = container.offsetWidth;
  const height = container.offsetHeight;

  if (width === 0 || height === 0) {
    console.warn('⚠️ Chart container has 0 dimensions, retrying...');
    setTimeout(loadDomitChart, 100);
    return;
  }

  console.log('✅ Creating chart with dimensions: ' + width + 'x' + height);

  if (domitChart) {
    console.warn('⚠️ Chart already exists');
    return;
  }

  try {
    domitChart = LightweightCharts.createChart(container, {
      width: width,
      height: height,
      layout: {
        backgroundColor: '#000000',
        textColor: '#ffffff',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    domitCandleSeries = domitChart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    fetchDomitPrices();

    window.addEventListener('resize', function() {
      if (domitChart && container) {
        domitChart.applyOptions({ width: container.offsetWidth });
      }
    });

    console.log('✅ Chart created successfully');

  } catch (error) {
    console.error('❌ Error creating chart:', error);
    domitChart = null;
    setTimeout(loadDomitChart, 500);
  }
}

async function fetchDomitPrices() {
  try {
    const response = await fetch('/api/get_domit_prices');
    const data = await response.json();

    if (data.candles && data.candles.length > 0) {
      // ✅ REMOVE duplicates by time
      const uniqueMap = {};
      data.candles.forEach(function(c) {
        uniqueMap[c.time] = c;
      });

      // ✅ FORMAT data for LightweightCharts
      const formattedCandles = Object.values(uniqueMap).map(function(c) {
        return {
          time: Number(c.time),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        };
      });

      // ✅ SORT by time ascending
      formattedCandles.sort(function(a, b) { return a.time - b.time; });

      // ✅ VALIDATE data
      const validCandles = formattedCandles.filter(function(c) {
        return c.time > 0 && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0;
      });

      if (validCandles.length === 0) {
        console.warn('⚠️ No valid candles');
        return;
      }

      console.log('📊 Setting ' + validCandles.length + ' candles');
      domitCandleSeries.setData(validCandles);
      window.firstCandleOpen = validCandles[0].open;
      // Update current price
      const current = validCandles[validCandles.length - 1];
      const currentEl = document.getElementById('domit-current');
      if (currentEl) {
        currentEl.textContent = current.close.toFixed(4);
      }

      // Update 24h change
      if (validCandles.length > 1) {
        const first = validCandles[0].open;
        const last = current.close;
        const change = ((last - first) / first * 100).toFixed(2);
        const changeEl = document.getElementById('domit-change');
        if (changeEl) {
          changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
          changeEl.style.color = change >= 0 ? '#26a69a' : '#ef5350';
        }
      }
    }
  } catch (error) {
    console.error('❌ Error loading DOMIT prices:', error);
    const currentEl = document.getElementById('domit-current');
    if (currentEl) currentEl.textContent = '—';
  }
}

window.addEventListener('load', function() {
  if (typeof LightweightCharts === 'undefined') {
    console.error('❌ LightweightCharts library not loaded');
    return;
  }

  setTimeout(function() {
    const container = document.getElementById('domit-chart');
    if (container && container.offsetWidth > 0) {
      loadDomitChart();
    } else {
      console.error('⚠️ Chart container not ready, retrying...');
      setTimeout(loadDomitChart, 300);
    }
  }, 500);
  const container = document.getElementById('domit-chart');
  if (container && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function(entries) {
      chartVisible = entries[0].isIntersecting;
    });
    observer.observe(container);
  }
  initEffectObserver();
});

const portalOrb = document.getElementById("portal-orb");
if (portalOrb) {
  portalOrb.addEventListener("click", async function() {
    if (!CURRENT_USER_ID) return;
    
    // Always show portal closed notification
    showPortalNotification();
    return;
  });
}

// 🔌 Socket.IO Real-time Connection
const socket = io();
let lastCandleTime = 0;  

// Smooth scroll performance mode
let scrollingNow = false;
let scrollEndTimer = null;
function setScrolling(state){
  scrollingNow = state;
  try {
    if (state) {
      document.body.classList.add('scrolling');
    } else {
      document.body.classList.remove('scrolling');
    }
  } catch(_){ }
}
function onScrollPerf(){
  if (!scrollingNow) setScrolling(true);
  if (scrollEndTimer) clearTimeout(scrollEndTimer);
  scrollEndTimer = setTimeout(function(){ setScrolling(false); }, 320);
}
window.addEventListener('scroll', onScrollPerf, { passive: true });
window.addEventListener('touchmove', onScrollPerf, { passive: true });
window.addEventListener('wheel', onScrollPerf, { passive: true });

socket.on('connect', () => {
  console.log('🟢 Realtime connected');
  socket.emit('join_chart');  // ✅ Join chart room
  console.log('📊 Joined chart_viewers room');
});

socket.on('domit_update', (data) => {
  scheduleDomitUpdate(data);
});

socket.on('new_candle', (data) => {
  if (domitCandleSeries && data.time !== lastCandleTime) {
    scheduleDomitUpdate(data);
    if (domitChart) {
      domitChart.timeScale().scrollToRealTime();
    }
  }
});
if (false) {
// ========== Mobile Auto-Optimization ==========
function isMobileOrLowEnd() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isLowEnd = navigator.deviceMemory ? navigator.deviceMemory < 4 : false;
  const isFewCores = navigator.hardwareConcurrency ? navigator.hardwareConcurrency < 4 : false;
  
  return isMobile || isLowEnd || isFewCores;
}

function disableHeavyAnimations() {
  try { document.body.classList.add('lowperf'); } catch(_){ }
}

if (isMobileOrLowEnd()) {
  console.log('📱 Mobile detected. Performance mode enabled.');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableHeavyAnimations);
  } else {
    disableHeavyAnimations();
  }
}

const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: `${window.location.origin}/webapp/tonconnect-manifest.json`,
  buttonRootId: "ton-connect",
});

let TON_WALLET = null;

function showSuccessModal(title, message) {
  const modal = document.getElementById("success-modal");
  modal.querySelector(".modal-title").textContent = title;
  modal.querySelector(".modal-message").textContent = message;
  modal.style.display = "flex";
}

function closeSuccessModal() {
  document.getElementById("success-modal").style.display = "none";
}

async function checkUsernameAvailable(name){
  try {
    const q = encodeURIComponent(name);
    const res = await fetch(`/api/search_users?q=${q}&viewer=${CURRENT_USER_ID}`);
    const d = await res.json();
    if (d.ok && Array.isArray(d.users)) {
      const taken = d.users.some(u => String(u.username||"").toLowerCase() === name.toLowerCase() && Number(u.user_id) !== Number(CURRENT_USER_ID));
      return !taken;
    }
  } catch(_){ }
  return true;
}

function hasUsernameFlag(){
  try { return localStorage.getItem('username_set_' + String(CURRENT_USER_ID)) === '1'; } catch(_){ return false; }
}

function setUsernameFlag(){
  try { localStorage.setItem('username_set_' + String(CURRENT_USER_ID), '1'); } catch(_){ }
}

function getStoredUsername(){
  try { return localStorage.getItem('uname_' + String(CURRENT_USER_ID)) || ""; } catch(_){ return ""; }
}

function setStoredUsername(name){
  try { localStorage.setItem('uname_' + String(CURRENT_USER_ID), name); } catch(_){ }
}

// Функция для обновления ежедневного бонуса
function updateDailyBonus() {
  if (!CURRENT_USER_ID) return;
  
  const today = new Date().toDateString();
  const lastVisit = localStorage.getItem(`last_visit_${CURRENT_USER_ID}`);
  const bonusClaimed = localStorage.getItem(`daily_bonus_${CURRENT_USER_ID}`) === 'true';
  
  const bonusText = document.getElementById("daily-bonus-text");
  const bonusBtn = document.getElementById("daily-bonus-btn");
  
  if (!bonusText || !bonusBtn) return;
  
  if (lastVisit === today && bonusClaimed) {
    bonusText.textContent = "Бонус уже получен сегодня. Приходите завтра!";
    bonusBtn.style.display = "none";
  } else {
    bonusText.textContent = "Получите 0.01 DOMIT ежедневный бонус!";
    bonusBtn.style.display = "inline-block";
  }
}

// Функция для получения ежедневного бонуса
async function claimDailyBonus() {
  if (!CURRENT_USER_ID) {
    alert("❌ Откройте приложение из Telegram бота!");
    return;
  }
  
  const today = new Date().toDateString();
  const bonusClaimed = localStorage.getItem(`daily_bonus_${CURRENT_USER_ID}`) === 'true';
  
  if (bonusClaimed) {
    alert("❌ Бонус уже получен сегодня!");
    return;
  }
  
  const bonusBtn = document.getElementById("daily-bonus-btn");
  const bonusText = document.getElementById("daily-bonus-text");
  
  bonusBtn.textContent = "⏳ Загрузка...";
  bonusBtn.disabled = true;
  
  try {
    const res = await fetch(`${API_BASE}/api/daily_bonus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: CURRENT_USER_ID })
    });
    
    const data = await res.json();
    
    if (data.ok) {
      localStorage.setItem(`daily_bonus_${CURRENT_USER_ID}`, 'true');
      localStorage.setItem(`last_visit_${CURRENT_USER_ID}`, today);
      
      bonusText.textContent = "✅ Бонус получен! +0.01 DOMIT";
      bonusBtn.style.display = "none";
      
      // Обновляем баланс
      balance += 0.01;
      updateBalanceDisplay();
      
      alert("✅ Ежедневный бонус 0.01 DOMIT получен!");
    } else {
      bonusBtn.textContent = "Получить бонус";
      bonusBtn.disabled = false;
      alert("❌ " + (data.message || "Ошибка при получении бонуса"));
    }
  } catch (error) {
    console.error("Daily bonus error:", error);
    bonusBtn.textContent = "Получить бонус";
    bonusBtn.disabled = false;
    alert("❌ Ошибка сервера. Попробуйте позже.");
  }
}

function showUsernameModal(){
  const m = $("username-modal");
  const i = $("username-input");
  const e = $("username-error");
  const b = $("username-save-btn");
  if (!m || !b) return;
  m.style.display = "flex";
  if (e) e.textContent = "";
  if (i) i.value = "";
  b.onclick = async function(){
    const name = i && i.value ? i.value.trim() : "";
    if (!name || name.length < 3){ if (e) e.textContent = "Имя пользователя должно содержать не менее 3 символов."; return; }
    const ok = await checkUsernameAvailable(name);
    if (!ok){ if (e) e.textContent = "Это имя уже занято."; return; }
    const r = await fetch(`/api/set_username`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: CURRENT_USER_ID, username: name }) });
    try { await r.json(); } catch(_){ }
    $("user-name").textContent = name;
    setUsernameFlag();
    setStoredUsername(name);
    m.style.display = "none";
  };
}

async function attemptSetUsername(name){
  const ok = await checkUsernameAvailable(name);
  if (!ok){ showUsernameModal(); return; }
  try {
    const r = await fetch(`/api/set_username`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: CURRENT_USER_ID, username: name }) });
    try { await r.json(); } catch(_){ }
    $("user-name").textContent = name;
    setUsernameFlag();
    setStoredUsername(name);
  } catch(_){ showUsernameModal(); }
}

// Function to save wallet to backend
async function saveWalletToBackend() {
  if (!TON_WALLET || !CURRENT_USER_ID) {
    console.log("⏳ Waiting for both wallet and user ID...");
    return;
  }

  console.log("💾 Saving wallet to backend:", TON_WALLET);
  
  try {
    const res = await fetch(`${API_BASE}/api/wallet_connect`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({user_id: CURRENT_USER_ID, wallet: TON_WALLET})
    });
    const data = await res.json();
    
    if (data.ok) {
      console.log("✅ Wallet saved successfully:", data);
      const walletStatus = document.getElementById("wallet-status");
      if (walletStatus) {
        const short = TON_WALLET.slice(0, 6) + "..." + TON_WALLET.slice(-4);
        walletStatus.textContent = "✅ Wallet connected: " + short;
      }
    } else {
      console.error("❌ Wallet save failed:", data);
    }
  } catch (e) {
    console.error("❌ Wallet save error:", e);
  }
}

tonConnectUI.onStatusChange((walletInfo) => {
  if (walletInfo && walletInfo.account) {
    TON_WALLET = walletInfo.account.address;
    console.log("💎 TON Wallet Connected:", TON_WALLET);

    const walletStatus = document.getElementById("wallet-status");
    if (walletStatus) {
      const short = TON_WALLET.slice(0, 6) + "..." + TON_WALLET.slice(-4);
      walletStatus.textContent = "Wallet connected: " + short;
    }

    // Try to save immediately
    saveWalletToBackend();
  }
});

console.log("✅ Casino WebApp loaded");
const tg = window.Telegram && window.Telegram.WebApp;
// 🔗 Telegram deep-link support
const urlParams = new URLSearchParams(window.location.search);

const START_PARAM =
  urlParams.get("tgWebAppStartParam") ||
  (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ||
  null;

console.log("🔗 START_PARAM =", START_PARAM);

const API_BASE = window.location.origin;
let CURRENT_USER_ID = null;
let CURRENT_USERNAME = null;
let balance = 0.0;

function $(id) {
  return document.getElementById(id);
}

function updateUserHeader() {
  if ($("user-id")) $("user-id").textContent = CURRENT_USER_ID ?? "-";
  if ($("user-name")) $("user-name").textContent = CURRENT_USERNAME ?? "-";
}

function updateBalanceDisplay() {
  const el = $("user-balance");
  if (el) el.textContent = balance.toFixed(3) + " DOMIT";
}

async function loadMiningPlans() {
    try {
        const res = await fetch(`${API_BASE}/api/mining/plans`);
        const data = await res.json();

        if (!data.ok || !Array.isArray(data.plans)) return;

        const box = document.getElementById("mining-plans-box");
        if (!box) return;
        box.innerHTML = "";

        data.plans.forEach(plan => {
            const priceDomit = Number(plan.price_usd);          
            const speedDomitHr = Number(plan.domit_per_hour);   

            const el = document.createElement("div");
            el.className = "plan-card";
            el.innerHTML = `
                <div class="plan-title">${plan.name}</div>
                <div class="plan-price">${priceDomit.toFixed(2)} DOMIT</div>
                <div class="plan-speed">${speedDomitHr.toFixed(2)} DOMIT/hr</div>
                <button class="btn buy-btn" data-plan-id="${plan.id}">
                  Купить
                </button>
            `;
            box.appendChild(el);
        });

        document.querySelectorAll(".buy-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const planId = btn.getAttribute("data-plan-id");
                buyMiningPlan(planId);
            });
        });
    } catch (err) {
        console.log("❌ loadMiningPlans error", err);
    }
}



async function loadMiningState() {
    if (!CURRENT_USER_ID) return;

    try {
        const res = await fetch(`${API_BASE}/api/mining/state/${CURRENT_USER_ID}`);
        const data = await res.json();

        const box = document.getElementById("mining-active-box");
        if (!box) return;

        if (!data.ok || !data.state) {
            box.style.display = "none";
            return;
        }

        box.style.display = "block";

        const st = data.state;
        document.getElementById("mining-active-tier").textContent = st.tier;
        document.getElementById("mining-active-speed").textContent = st.speed.toFixed(2);
        document.getElementById("mining-active-earned").textContent = st.earned.toFixed(2);
    } catch (err) {
        console.log("❌ loadMiningState error", err);
    }
}

const tgParam = new URLSearchParams(window.location.search)
    .get("tgWebAppStartParam");

if (tgParam && tgParam.startsWith("post_")) {
    const postId = tgParam.replace("post_", "");
}


async function loadFakeHistory() {
  const box = document.getElementById("fake-history-list");
  if (!box) return;
  
  try {
    const uidParam = CURRENT_USER_ID ? `?uid=${CURRENT_USER_ID}` : "";
    const res = await fetch(`${API_BASE}/api/fake_history${uidParam}`);
    const data = await res.json();
    if (data.ok && Array.isArray(data.history)) {
      if (data.history.length === 0) {
        box.innerHTML = "<p>Нет недавних транзакций</p>";
        return;
      }
      box.innerHTML = "";
      data.history.forEach(item => {
        const row = document.createElement("div");
        row.style.marginBottom = "4px";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        
        const typeIcon = item.type === 'withdraw' ? '🔴' : '🟢';
        const color = item.type === 'withdraw' ? '#ff6b6b' : '#51cf66';
        
        row.innerHTML = `
          <span>${typeIcon} ${item.user}</span>
          <span style="color:${color}; font-weight:bold;">${item.amount} DOMIT</span>
        `;
        box.appendChild(row);
      });
    }
  } catch (e) {
    // console.error("Fake history error", e);
  }
}

async function buyMiningPlan(planId) {
    if (!CURRENT_USER_ID) return;

    try {
        const res = await fetch(`${API_BASE}/api/mining/buy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: CURRENT_USER_ID,
                plan_id: Number(planId)   
            })
        });

        const data = await res.json();

        if (!data.ok) {
            if (tg) {
                let msg = "❌ " + (data.error || "Произошла ошибка.");
                if (data.error === "low_balance") {
                    msg = "❌ У вас недостаточно DOMIT для этого пакета.";
                }
                tg.showPopup({ message: msg });
            }
            return;
        }

        if (tg) tg.showPopup({ message: "✅ Пакет активирован" });

        if (data.user) {
            balance = data.user.balance_usd;
            updateBalanceDisplay();
        }

        loadMiningState();
    } catch (err) {
        console.log("❌ buyMiningPlan error", err);
        if (tg) tg.showPopup({ message: "❌ Ошибка сервера" });
    }
}

document.getElementById("mining-claim-btn")
    .addEventListener("click", async () => {

    if (!CURRENT_USER_ID) return;

    try {
        const res = await fetch(`${API_BASE}/api/mining/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: CURRENT_USER_ID })
        });

        const data = await res.json();

        if (!data.ok) {
            if (tg) tg.showPopup({ message: "❌ " + data.error });
            return;
        }

        if (data.user) {
            balance = data.user.balance_usd;
        } else if (typeof data.new_balance_usd === "number") {
            balance = data.new_balance_usd;
        }
        updateBalanceDisplay();

        const claimedDomit = data.claimed_usd || 0;
        if (tg) {
            tg.showPopup({
                message: `✅ ${claimedDomit.toFixed(2)} DOMIT переведено на ваш баланс`
            });
        }

        loadMiningState();
    } catch (err) {
        console.log("❌ loadMiningState error", err);
        if (tg) tg.showPopup({ message: "❌ Ошибка сервера" });
    }
});


async function loadTonRate() {
    try {
        const res = await fetch(`${API_BASE}/api/ton_rate`);
        const data = await res.json();

        if (data.ok) {
            const rate = data.ton_usd;

            document.getElementById("ton-current").textContent = rate.toFixed(4);
        } else {
            document.getElementById("ton-current").textContent = "—";
        }
    } catch (e) {
        document.getElementById("ton-current").textContent = "—";
    }

    window.location.href = url;
}

function initFromTelegram() {
  if (!tg) {
    console.log("⚠️ Telegram WebApp object нет (открыто в браузере)");
    updateUserHeader();
    updateBalanceDisplay();
    return;
  }

  tg.ready();
  tg.expand();

  // Poll for fake history
  setInterval(loadFakeHistory, 5000);
  loadFakeHistory();

  console.log("ℹ️ tg.initDataUnsafe =", tg.initDataUnsafe);

  const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (user) {
    CURRENT_USER_ID = user.id;
    CURRENT_USERNAME =
      user.first_name + (user.username ? " (@" + user.username + ")" : "");
    
    // Try to save wallet if already connected
    saveWalletToBackend();
  } else {
    console.log("⚠️ user object нет от initDataUnsafe");
  }

  // 🧠 save deep-linked post for portal
  if (START_PARAM && START_PARAM.startsWith("post_")) {
    window.DEEP_LINK_POST_ID = START_PARAM.replace("post_", "");
    console.log("📌 Deep link post id:", window.DEEP_LINK_POST_ID);
  }

  updateUserHeader();
  updateBalanceDisplay();
  loadUserFromBackend();
}

document.querySelector(".top h1").addEventListener("click", async () => {
    if (!CURRENT_USER_ID) return;
    
    // Always show portal closed notification
    showPortalNotification();
    return;
});


async function loadUserFromBackend() {
  if (!CURRENT_USER_ID) {
    console.log("⛔ CURRENT_USER_ID нет");
    return;
  }

  const url = `${API_BASE}/api/user/${CURRENT_USER_ID}`;
  console.log("🌐 Загрузка пользовательских данных:", url);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.user) {
      console.log("⚠️ user not found");
      alert("❌ Пользователь не найден. Попробуйте перезапустить приложение.");
      return;
    }

    // Проверяем, новый ли пользователь
    const U = data.user;
    const today = new Date().toDateString();
    const lastVisit = localStorage.getItem(`last_visit_${CURRENT_USER_ID}`);
    
    if (lastVisit !== today) {
      // Новый день - сбрасываем бонус
      localStorage.setItem(`last_visit_${CURRENT_USER_ID}`, today);
      localStorage.setItem(`daily_bonus_${CURRENT_USER_ID}`, 'false');
      console.log("🗓️ Новый день для пользователя:", CURRENT_USER_ID);
    }

    console.log("🔍 DEBUG: U.ref_count =", U.ref_count);
    console.log("🔍 DEBUG: element exists?", $("ref-total"));

    // Обновляем ежедневный бонус
    updateDailyBonus();

    $("user-id").textContent = CURRENT_USER_ID;
    $("user-name").textContent = U.username || "-";
    $("user-balance").textContent = U.balance_usd.toFixed(3) + " DOMIT";
    balance = U.balance_usd;
    if (document.getElementById("ton-current")) {
      document.getElementById("ton-current").textContent = U.ton_balance.toFixed(4);
    }

    if ($("ref-total")) {
      $("ref-total").textContent = U.ref_count;
      console.log("✅ ref-total обновлено:", U.ref_count);
    }
    if ($("ref-active")) $("ref-active").textContent = U.active_refs;
    if ($("ref-deposits")) $("ref-deposits").textContent = U.team_deposit_usd.toFixed(2) + " DOMIT";

    const botUsername = "doominobot";
    $("ref-link").value =
      `https://t.me/${botUsername}?start=ref_${CURRENT_USER_ID}`;

    console.log("✔ User loaded OK");

    const teleU = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.username;
    if (teleU && String(teleU).trim() !== "") {
      if (U.username !== teleU) {
        await attemptSetUsername(teleU);
      }
      $("user-name").textContent = teleU;
    } else {
      if (U.username && String(U.username).trim() !== "") {
        $("user-name").textContent = U.username;
      } else {
        const ls = getStoredUsername();
        if (ls && ls.trim() !== "") {
          $("user-name").textContent = ls;
          await attemptSetUsername(ls);
        } else {
          showUsernameModal();
        }
      }
    }

  } catch (err) {
    console.log("❌ loadUser error:", err);
  }
}



function openCrash() {
    window.location.href = `/webapp/games/crash.html?uid=${CURRENT_USER_ID}`;
}
function openDice() {
    window.location.href = `/webapp/games/dice.html?uid=${CURRENT_USER_ID}`;
}
function openSlots() {
    showLockedGame('Slots');
}

function openCoinflip() {
    showLockedGame('Coinflip');
}

function showLockedGame(gameName) {
    const msgBox = document.getElementById('locked-game-msg');
    const title = document.getElementById('locked-game-title');
    title.textContent = gameName;
    msgBox.style.display = 'block';
    setTimeout(() => { msgBox.style.display = 'none'; }, 4000);
}



function openMining() {
    window.location.href = `/webapp/mining/index.html?uid=${CURRENT_USER_ID}`;
}
const buttons = document.querySelectorAll(".btn[data-section]");
const screens = document.querySelectorAll(".screen");

function showScreen(name) {
  screens.forEach((s) => s.classList.remove("active"));
  const screen = $("screen-" + name);
  if (screen) screen.classList.add("active");

}




buttons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const section = btn.getAttribute("data-section");
    showScreen(section);
  });
});

const walletInput = $("wallet-input");
const walletStatus = $("wallet-status");
const walletSaveBtn = $("wallet-save-btn");

if (walletSaveBtn) {
  walletSaveBtn.addEventListener("click", async () => {
    const value = walletInput.value.trim();
    if (!value) {
      walletStatus.textContent = "Пожалуйста, введите адрес вашего кошелька.։";
      return;
    }
    if (!CURRENT_USER_ID) {
      walletStatus.textContent = "Идентификатор пользователя Telegram не найден. Открытие из бота, а не из браузера.։";
      return;
    }

    walletStatus.textContent = "Сохраняем wallet…";

    const url = `${API_BASE}/api/wallet_connect`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: CURRENT_USER_ID,
          wallet: value,
        }),
      });

      if (!res.ok) {
        walletStatus.textContent = "Ошибка на стороне бэкэнда (проверю позже)։";
        return;
      }

      const data = await res.json();
      if (data.ok) {
        walletStatus.textContent =
          "Счет в кошельке успешно сохранен. Бонус будет зачислен в админку. 💰";
        if (data.user && typeof data.user.balance === "number") {
          balance = data.user.balance;
          updateBalanceDisplay();
        }
      } else {
        walletStatus.textContent =
          data.error || "Не удалось сохранить кошелек (ответ бэкэнда)։";
      }
    } catch (err) {
      console.log("❌ Wallet save error:", err);
      walletStatus.textContent =
        "Не удалось подключиться к серверу. Пожалуйста, попробуйте позже.։";
    }
  });
}
const depositInput = $("deposit-amount");
const depositStatus = $("deposit-status");
const depositBtn = $("deposit-btn");

if (depositBtn) {
  depositBtn.addEventListener("click", async () => {

    const amount = Number(depositInput.value);
    if (!amount || amount <= 0) {
      depositStatus.textContent = "Укажите правильное количество тонн։";
      return;
    }

    if (!TON_WALLET) {
      depositStatus.textContent = "Подключите свой кошелек TON.։";
      return;
    }

    depositStatus.textContent = "Открытие всплывающего окна оплаты TON…";

    const RECEIVER_TON_ADDRESS = "UQC0hJAYzKWuRKVnUtu_jeHgbyxznehBllc63azIdeoPUBfW"; 

  try {
    async function sendTonTx() {
      return tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        messages: [
          { address: RECEIVER_TON_ADDRESS, amount: (amount * 1e9).toString() }
        ]
      });
    }

    let result;
    try {
      result = await sendTonTx();
    } catch (e1) {
      try { result = await sendTonTx(); } catch (e2) {
        const nano = Math.round(amount * 1e9);
        const fallback = `ton://transfer/${RECEIVER_TON_ADDRESS}?amount=${nano}`;
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
          window.Telegram.WebApp.openLink(fallback);
        } else {
          window.open(fallback, "_blank");
        }
        if (window.confirm("Вы отправили платеж на адрес, указанный в Кошельке?")) {
          result = { boc: "" };
        } else {
          depositStatus.textContent = "Проверка кошелька не удалась. Пожалуйста, попробуйте еще раз.";
          return;
        }
      }
    }

    console.log("TON Transaction:", result);

    depositStatus.textContent =
      "Депозит отправлен.։ Tx hash: " + result.boc.slice(0, 10) + "...";

    const r = await fetch(`${API_BASE}/api/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: CURRENT_USER_ID, amount })
    });
    const d = await r.json();
    if (!d.ok) {
      depositStatus.textContent = "❌ " + (d.message || d.error || "Произошла ошибка.");
    } else {
      depositStatus.textContent = "✅ " + (d.message || "Зарегистрированный депозит");
      if (d.user) {
        balance = d.user.balance_usd;
        updateBalanceDisplay();
        const rt = document.getElementById("ref-total");
        const ra = document.getElementById("ref-active");
        const rd = document.getElementById("ref-deposits");
        if (rt) rt.textContent = d.user.ref_count;
        if (ra) ra.textContent = d.user.active_refs;
        if (rd) rd.textContent = d.user.team_deposit_usd.toFixed(2) + " DOMIT";
      }
    }

  } catch (err) {
    console.log("❌ TON popup error:", err);
    depositStatus.textContent = "Пользователь отменил заказ или произошла ошибка։";
  }
  });
}

const withdrawInput = $("withdraw-amount");
const withdrawStatus = $("withdraw-status");
const withdrawBtn = $("withdraw-btn");
const promoInput = $("promo-code");
const promoBtn = $("promo-btn");

if (withdrawBtn) {
  withdrawBtn.addEventListener("click", () => {

    const amount = Number(withdrawInput.value);

    if (!amount || amount <= 0) {
      withdrawStatus.textContent = "❌ Укажите сумму правильно։";
      return;
    }

    if (!CURRENT_USER_ID) {
      withdrawStatus.textContent = "❌ Откройте веб-приложение из самого бота, а не из браузера.";
      return;
    }

    if (amount > balance) {
      withdrawStatus.textContent = "❌ Введенная вами сумма превышает ваш баланс.";
      return;
    }

    const refActive = Number($("ref-active").textContent) || 0;
    const refDeposits = Number(
      ($("ref-deposits").textContent || "0").replace("$", "")
    );

    if (refActive < 5 || refDeposits < 5) {
      withdrawStatus.innerHTML =
        "❌ Не удалось снять наличные..<br><br>" +
        "• Требуется не менее 5 активных приглашенных пользователей.<br>" +
        "• Необходимо наличие активного приглашенного пользователя с общим реферальным депозитом ≥ 5 DOMIN.<br>" +
        "• Сумма не может превышать остаток на счете.";
      return;
    }

    withdrawStatus.textContent = "⏳ Проверка…";

    fetch(`${API_BASE}/api/withdraw_request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: CURRENT_USER_ID,
        amount: amount
      })
    })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) {
        withdrawStatus.textContent = "❌ " + (data.message || "Произошла ошибка.");
      } else {
        withdrawStatus.textContent = "✅ " + data.message;

        if (data.user) {
          balance = data.user.balance_usd;
          updateBalanceDisplay();
          $("ref-total").textContent = data.user.ref_count;
          $("ref-active").textContent = data.user.active_refs;
          $("ref-deposits").textContent = data.user.team_deposit_usd.toFixed(2) + " DOMIT";
        }
      }
    })
    .catch(err => {
      withdrawStatus.textContent = "❌ Ошибка сервера";
      console.error(err);
    });


  });
}

if (promoBtn) {
  promoBtn.addEventListener("click", async () => {
    const code = (promoInput && promoInput.value || "").trim();
    if (!code) {
      withdrawStatus.textContent = "❌ Введите промокод правильно.";
      return;
    }
    if (!CURRENT_USER_ID) {
      withdrawStatus.textContent = "❌ Откройте веб-приложение из самого бота, а не из браузера.";
      return;
    }
    withdrawStatus.textContent = "⏳ Проверка промокода…";
    try {
      const r = await fetch(`${API_BASE}/api/promocode/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: CURRENT_USER_ID, code })
      });
      const d = await r.json();
      if (!d.ok) {
        withdrawStatus.textContent = "❌ " + (d.message || d.error || "Промокод недействителен.");
      } else {
        const gained = Number(d.amount || 0).toFixed(2);
        withdrawStatus.textContent = `✅ Промокод активирован. +${gained} DOMIT`;
        if (d.user && typeof d.user.balance_usd === "number") {
          balance = d.user.balance_usd;
          updateBalanceDisplay();
          const rt = document.getElementById("ref-total");
          const ra = document.getElementById("ref-active");
          const rd = document.getElementById("ref-deposits");
          if (rt && typeof d.user.ref_count !== "undefined") rt.textContent = d.user.ref_count;
          if (ra && typeof d.user.active_refs !== "undefined") ra.textContent = d.user.active_refs;
          if (rd && typeof d.user.team_deposit_usd !== "undefined") rd.textContent = d.user.team_deposit_usd.toFixed(2) + " DOMIT";
        }
      }
    } catch (err) {
      withdrawStatus.textContent = "❌ Ошибка сервера";
      console.error(err);
    }
  });
}

const refLinkInput = $("ref-link");
const refCopyBtn = $("ref-copy-btn");

function initReferralLink() {
  if (!refLinkInput) return;

  if (CURRENT_USER_ID) {
    const botUsername = "doominobot"; 
    const link = `https://t.me/${botUsername}?start=ref_${CURRENT_USER_ID}`;
    refLinkInput.value = link;
  } else {
    refLinkInput.value =
      "Нет идентификатора пользователя (тестирование вне веб-приложения Telegram)";
  }
}

if (refCopyBtn) {
  refCopyBtn.addEventListener("click", () => {
    if (!refLinkInput) return;
    refLinkInput.select();
    document.execCommand("copy");
    showSuccessModal("✅ Сделанный", "Ссылка скопирована в память");
  });
}

initFromTelegram();
initReferralLink();
updateBalanceDisplay();

function initEffectObserver() {
  if (!('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll(
    '.screen, .task-card, .task-btn, #app .inner-ring, #app .glass-reflect, #app .noise-overlay, #app .corner-node'
  );
  if (!targets || targets.length === 0) return;
  const io = new IntersectionObserver(function(entries) {
    entries.forEach(function(e){
      if (e.isIntersecting) {
        e.target.classList.remove('effect-off');
      } else {
        e.target.classList.add('effect-off');
      }
    });
  }, { threshold: 0.01 });
  targets.forEach(function(t){ io.observe(t); });
}

// ═══════════════════════════════════════════
// DOMIT/TON CHART (Lightweight Charts)
// ═══════════════════════════════════════════

let domitChart;
let domitCandleSeries;

let chartVisible = true;
let throttleMs = isMobileOrLowEnd() ? 150 : 80;
let lastUpdateTs = 0;
let pendingUpdateTimer = null;
let latestDomitData = null;

function applyDomitUpdate(data) {
  domitCandleSeries.update(data);
  lastCandleTime = data.time;

  const currentEl = document.getElementById('domit-current');
  if (currentEl) {
    currentEl.textContent = Number(data.close).toFixed(4);
  }

  const changeEl = document.getElementById('domit-change');
  if (changeEl && window.firstCandleOpen) {
    const change = ((data.close - window.firstCandleOpen) / window.firstCandleOpen * 100).toFixed(2);
    changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
    changeEl.style.color = change >= 0 ? '#26a69a' : '#ef5350';
  }
}

function scheduleDomitUpdate(data) {
  latestDomitData = data;
  if (!chartVisible || !domitCandleSeries || scrollingNow) return;
  const now = Date.now();
  const dueIn = throttleMs - (now - lastUpdateTs);
  if (dueIn <= 0) {
    lastUpdateTs = now;
    applyDomitUpdate(latestDomitData);
    latestDomitData = null;
    if (pendingUpdateTimer) { clearTimeout(pendingUpdateTimer); pendingUpdateTimer = null; }
  } else if (!pendingUpdateTimer) {
    pendingUpdateTimer = setTimeout(function() {
      pendingUpdateTimer = null;
      if (chartVisible && domitCandleSeries && latestDomitData) {
        lastUpdateTs = Date.now();
        applyDomitUpdate(latestDomitData);
        latestDomitData = null;
      }
    }, dueIn);
  }
}

function loadDomitChart() {
  const container = document.getElementById('domit-chart');

  if (!container) {
    console.error('❌ domit-chart element not found');
    return;
  }

  const width = container.offsetWidth;
  const height = container.offsetHeight;

  if (width === 0 || height === 0) {
    console.warn('⚠️ Chart container has 0 dimensions, retrying...');
    setTimeout(loadDomitChart, 100);
    return;
  }

  console.log('✅ Creating chart with dimensions: ' + width + 'x' + height);

  if (domitChart) {
    console.warn('⚠️ Chart already exists');
    return;
  }

  try {
    domitChart = LightweightCharts.createChart(container, {
      width: width,
      height: height,
      layout: {
        backgroundColor: '#000000',
        textColor: '#ffffff',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    domitCandleSeries = domitChart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    fetchDomitPrices();

    window.addEventListener('resize', function() {
      if (domitChart && container) {
        domitChart.applyOptions({ width: container.offsetWidth });
      }
    });

    console.log('✅ Chart created successfully');

  } catch (error) {
    console.error('❌ Error creating chart:', error);
    domitChart = null;
    setTimeout(loadDomitChart, 500);
  }
}

async function fetchDomitPrices() {
  try {
    const response = await fetch('/api/get_domit_prices');
    const data = await response.json();

    if (data.candles && data.candles.length > 0) {
      // ✅ REMOVE duplicates by time
      const uniqueMap = {};
      data.candles.forEach(function(c) {
        uniqueMap[c.time] = c;
      });

      // ✅ FORMAT data for LightweightCharts
      const formattedCandles = Object.values(uniqueMap).map(function(c) {
        return {
          time: Number(c.time),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        };
      });

      // ✅ SORT by time ascending
      formattedCandles.sort(function(a, b) { return a.time - b.time; });

      // ✅ VALIDATE data
      const validCandles = formattedCandles.filter(function(c) {
        return c.time > 0 && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0;
      });

      if (validCandles.length === 0) {
        console.warn('⚠️ No valid candles');
        return;
      }

      console.log('📊 Setting ' + validCandles.length + ' candles');
      domitCandleSeries.setData(validCandles);
      window.firstCandleOpen = validCandles[0].open;
      // Update current price
      const current = validCandles[validCandles.length - 1];
      const currentEl = document.getElementById('domit-current');
      if (currentEl) {
        currentEl.textContent = current.close.toFixed(4);
      }

      // Update 24h change
      if (validCandles.length > 1) {
        const first = validCandles[0].open;
        const last = current.close;
        const change = ((last - first) / first * 100).toFixed(2);
        const changeEl = document.getElementById('domit-change');
        if (changeEl) {
          changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
          changeEl.style.color = change >= 0 ? '#26a69a' : '#ef5350';
        }
      }
    }
  } catch (error) {
    console.error('❌ Error loading DOMIT prices:', error);
    const currentEl = document.getElementById('domit-current');
    if (currentEl) currentEl.textContent = '—';
  }
}

window.addEventListener('load', function() {
  if (typeof LightweightCharts === 'undefined') {
    console.error('❌ LightweightCharts library not loaded');
    return;
  }

  setTimeout(function() {
    const container = document.getElementById('domit-chart');
    if (container && container.offsetWidth > 0) {
      loadDomitChart();
    } else {
      console.error('⚠️ Chart container not ready, retrying...');
      setTimeout(loadDomitChart, 300);
    }
  }, 500);
  const container = document.getElementById('domit-chart');
  if (container && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function(entries) {
      chartVisible = entries[0].isIntersecting;
    });
    observer.observe(container);
  }
  initEffectObserver();
});

const portalOrb = document.getElementById("portal-orb");
if (portalOrb) {
  portalOrb.addEventListener("click", async function() {
    if (!CURRENT_USER_ID) return;
    
    // Always show portal closed notification
    showPortalNotification();
    return;
  });
}

// 🔌 Socket.IO Real-time Connection
const socket = io();
let lastCandleTime = 0;  

// Smooth scroll performance mode
let scrollingNow = false;
let scrollEndTimer = null;
function setScrolling(state){
  scrollingNow = state;
  try {
    if (state) {
      document.body.classList.add('scrolling');
    } else {
      document.body.classList.remove('scrolling');
    }
  } catch(_){ }
}
function onScrollPerf(){
  if (!scrollingNow) setScrolling(true);
  if (scrollEndTimer) clearTimeout(scrollEndTimer);
  scrollEndTimer = setTimeout(function(){ setScrolling(false); }, 160);
}
window.addEventListener('scroll', onScrollPerf, { passive: true });
window.addEventListener('touchmove', onScrollPerf, { passive: true });
window.addEventListener('wheel', onScrollPerf, { passive: true });

socket.on('connect', () => {
  console.log('🟢 Realtime connected');
  socket.emit('join_chart');  // ✅ Join chart room
  console.log('📊 Joined chart_viewers room');
});

socket.on('domit_update', (data) => {
  scheduleDomitUpdate(data);
});

socket.on('new_candle', (data) => {
  if (domitCandleSeries && data.time !== lastCandleTime) {
    scheduleDomitUpdate(data);
    if (domitChart) {
      domitChart.timeScale().scrollToRealTime();
    }
  }
});
}
