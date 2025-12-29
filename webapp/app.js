// ========== Mobile Auto-Optimization ==========
function isMobileOrLowEnd() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isLowEnd = navigator.deviceMemory ? navigator.deviceMemory < 4 : false;
  const isFewCores = navigator.hardwareConcurrency ? navigator.hardwareConcurrency < 4 : false;
  
  return isMobile || isLowEnd || isFewCores;
}

function disableHeavyAnimations() {
  const style = document.createElement('style');
  style.id = 'performance-mode';
  style.textContent = `
    *[class*="Float"],
    *[class*="Glow"],
    *[class*="Pulse"],
    *[class*="Shine"],
    *[class*="Shift"],
    *[class*="Nebula"],
    *[class*="Particle"],
    *[class*="Halo"],
    *[class*="Crystal"],
    *[class*="Energy"],
    *[class*="Laser"],
    *[class*="Orb"],
    *[class*="Ring"],
    *[class*="Star"],
    *[class*="Glass"],
    *[class*="Noise"],
    *[class*="Grid"],
    *[class*="Node"] {
      animation: none !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(style);
}

// ✅ Auto-disable animations ԱՆՄԻՋԱՊԵՍ mobile-ում
if (isMobileOrLowEnd()) {
  console.log('📱 Mobile detected. Performance mode enabled.');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableHeavyAnimations);
  } else {
    disableHeavyAnimations();
  }
}

const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: "https://vorn-studio.github.io/0059bot/webapp/tonconnect-manifest.json",
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
    if (!name || name.length < 3){ if (e) e.textContent = "Username-ը պետք է ≥ 3 սիմվոլ լինի"; return; }
    const ok = await checkUsernameAvailable(name);
    if (!ok){ if (e) e.textContent = "Այդ անունը զբաղված է"; return; }
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
  if (el) el.textContent = balance.toFixed(3) + " $";
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
            const priceDomit = Number(plan.price_usd);          // հիմա DOMIT = USD
            const speedDomitHr = Number(plan.domit_per_hour);   // backend-ից գալիս է

            const el = document.createElement("div");
            el.className = "plan-card";
            el.innerHTML = `
                <div class="plan-title">${plan.name}</div>
                <div class="plan-price">${priceDomit.toFixed(2)} DOMIT</div>
                <div class="plan-speed">${speedDomitHr.toFixed(2)} DOMIT/hr</div>
                <button class="btn buy-btn" data-plan-id="${plan.id}">
                  Գնել
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
    // բացիր comments drawer կամ scroll արա
}


async function buyMiningPlan(planId) {
    if (!CURRENT_USER_ID) return;

    try {
        const res = await fetch(`${API_BASE}/api/mining/buy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: CURRENT_USER_ID,
                plan_id: Number(planId)   // ⬅️ ԱՂԲՅՈւՐԸ plan_id է, ոչ թե tier
            })
        });

        const data = await res.json();

        if (!data.ok) {
            if (tg) {
                let msg = "❌ " + (data.error || "Սխալ առաջացավ");
                if (data.error === "low_balance") {
                    msg = "❌ Բավարար DOMIT չունես այս փաթեթի համար";
                }
                tg.showPopup({ message: msg });
            }
            return;
        }

        if (tg) tg.showPopup({ message: "✅ Փաթեթը ակտիվացված է" });

        if (data.user) {
            balance = data.user.balance_usd;
            updateBalanceDisplay();
        }

        loadMiningState();
    } catch (err) {
        console.log("❌ buyMiningPlan error", err);
        if (tg) tg.showPopup({ message: "❌ Սերվերի սխալ" });
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
                message: `✅ ${claimedDomit.toFixed(2)} DOMIT փոխանցվեց ձեր բալանսին`
            });
        }

        loadMiningState();
    } catch (err) {
        console.log("❌ loadMiningState error", err);
        if (tg) tg.showPopup({ message: "❌ Սերվերի սխալ" });
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

function openPortal() {
    if (!window.Telegram.WebApp.initDataUnsafe.user) return;

    const uid = window.Telegram.WebApp.initDataUnsafe.user.id;

    let url = `${window.location.origin}/portal/portal.html?uid=${uid}&viewer=${uid}`;

    if (window.DEEP_LINK_POST_ID) {
        url += `&open_post=${window.DEEP_LINK_POST_ID}`;
    }

    window.location.href = url;
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
    console.log("⚠️ Telegram WebApp object չկա (բացված է բրաուզերում)");
    updateUserHeader();
    updateBalanceDisplay();
    return;
  }

  tg.ready();
  tg.expand();

  console.log("ℹ️ tg.initDataUnsafe =", tg.initDataUnsafe);

  const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (user) {
    CURRENT_USER_ID = user.id;
    CURRENT_USERNAME =
      user.first_name + (user.username ? " (@" + user.username + ")" : "");
    
    // Try to save wallet if already connected
    saveWalletToBackend();
  } else {
    console.log("⚠️ user object չկա initDataUnsafe-ից");
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

document.querySelector(".top h1").addEventListener("click", () => {
    if (!CURRENT_USER_ID) return;
    window.location.href =
      `${window.location.origin}/portal/portal.html?uid=${CURRENT_USER_ID}&viewer=${CURRENT_USER_ID}`;
});


async function loadUserFromBackend() {
  if (!CURRENT_USER_ID) {
    console.log("⛔ CURRENT_USER_ID չկա");
    return;
  }

  const url = `${API_BASE}/api/user/${CURRENT_USER_ID}`;
  console.log("🌐 Բեռնում ենք user տվյալները:", url);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.user) {
      console.log("⚠️ user not found");
      return;
    }

    // ← ՆԱԽ սահմանիր U-ն
    const U = data.user;

    // ← ՀԵՏՈ debug log-եր
    console.log("🔍 DEBUG: U.ref_count =", U.ref_count);
    console.log("🔍 DEBUG: element exists?", $("ref-total"));

    $("user-id").textContent = CURRENT_USER_ID;
    $("user-name").textContent = U.username || "-";
    $("user-balance").textContent = U.balance_usd.toFixed(3) + " $";
    balance = U.balance_usd;
    if (document.getElementById("ton-current")) {
      document.getElementById("ton-current").textContent = U.ton_balance.toFixed(4);
    }

    if ($("ref-total")) {
      $("ref-total").textContent = U.ref_count;
      console.log("✅ ref-total թարմացվեց:", U.ref_count);
    }
    if ($("ref-active")) $("ref-active").textContent = U.active_refs;
    if ($("ref-deposits")) $("ref-deposits").textContent = U.team_deposit_usd.toFixed(2) + " $";

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
      walletStatus.textContent = "Խնդրում ենք գրել wallet հասցեն։";
      return;
    }
    if (!CURRENT_USER_ID) {
      walletStatus.textContent = "Telegram user ID չգտանք։ Բացիր բոտից, ոչ թե browser-ից։";
      return;
    }

    walletStatus.textContent = "Պահպանում ենք wallet-ը…";

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
        walletStatus.textContent = "Սխալ backend-ից (կվերանայենք հետո)։";
        return;
      }

      const data = await res.json();
      if (data.ok) {
        walletStatus.textContent =
          "Wallet-ը հաջողությամբ պահպանված է։ Բոնուսը կավելացվի backend-ում 💰";
        if (data.user && typeof data.user.balance === "number") {
          balance = data.user.balance;
          updateBalanceDisplay();
        }
      } else {
        walletStatus.textContent =
          data.error || "Չստացվեց պահպանել wallet-ը (backend պատասխան)։";
      }
    } catch (err) {
      console.log("❌ Wallet save error:", err);
      walletStatus.textContent =
        "Չստացվեց կապվել սերվերին։ Խնդրում ենք փորձել ավելի ուշ։";
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
      depositStatus.textContent = "Գրիր ճիշտ TON գումար։";
      return;
    }

    if (!TON_WALLET) {
      depositStatus.textContent = "Կցրու քո TON Wallet-ը։";
      return;
    }

    depositStatus.textContent = "Բացում ենք TON վճարման popup-ը…";

    const RECEIVER_TON_ADDRESS = "UQC0hJAYzKWuRKVnUtu_jeHgbyxznehBllc63azIdeoPUBfW"; 

  try {
    const result = await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300, 
      messages: [
        {
          address: RECEIVER_TON_ADDRESS,
          amount: (amount * 1e9).toString(), 
        },
      ],
    });

    console.log("TON Transaction:", result);

    depositStatus.textContent =
      "Դեպոզիտը ուղարկված է։ Tx hash: " + result.boc.slice(0, 10) + "...";

    const r = await fetch(`${API_BASE}/api/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: CURRENT_USER_ID, amount })
    });
    const d = await r.json();
    if (!d.ok) {
      depositStatus.textContent = "❌ " + (d.message || d.error || "Սխալ առաջացավ");
    } else {
      depositStatus.textContent = "✅ " + (d.message || "Դեպոզիտը գրանցվեց");
      if (d.user) {
        balance = d.user.balance_usd;
        updateBalanceDisplay();
        const rt = document.getElementById("ref-total");
        const ra = document.getElementById("ref-active");
        const rd = document.getElementById("ref-deposits");
        if (rt) rt.textContent = d.user.ref_count;
        if (ra) ra.textContent = d.user.active_refs;
        if (rd) rd.textContent = d.user.team_deposit_usd.toFixed(2) + " $";
      }
    }

  } catch (err) {
    console.log("❌ TON popup error:", err);
    depositStatus.textContent = "Օգտատերը չեղարկեց կամ սխալ առաջացավ։";
  }
  });
}

const withdrawInput = $("withdraw-amount");
const withdrawStatus = $("withdraw-status");
const withdrawBtn = $("withdraw-btn");

if (withdrawBtn) {
  withdrawBtn.addEventListener("click", () => {

    const amount = Number(withdrawInput.value);

    if (!amount || amount <= 0) {
      withdrawStatus.textContent = "❌ Գումարը գրեք ճիշտ։";
      return;
    }

    if (!CURRENT_USER_ID) {
      withdrawStatus.textContent = "❌ Բացեք WebApp-ը բոտի միջից, ոչ թե browser-ից։";
      return;
    }

    if (amount > balance) {
      withdrawStatus.textContent = "❌ Ձեր գրած գումարը գերազանցում է ձեր բալանսը։";
      return;
    }

    const refActive = Number($("ref-active").textContent) || 0;
    const refDeposits = Number(
      ($("ref-deposits").textContent || "0").replace("$", "")
    );

    if (refActive < 10 || refDeposits < 200) {
      withdrawStatus.innerHTML =
        "❌ Չի ստացվի կանխիկացնել.<br><br>" +
        "• Պետք է ≥ 10 ակտիվ հրավիրված օգտատեր<br>" +
        "• Պետք է ակտիվ հրավիրված օգտատերի ≥ 200$ ընդհանուր ռեֆերալների դեպոզիտ<br>" +
        "• Գումարը չի կարող գերազանցել բալանսը";
      return;
    }

    withdrawStatus.textContent = "⏳ Ստուգում ենք…";

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
        withdrawStatus.textContent = "❌ " + (data.message || "Սխալ առաջացավ");
      } else {
        withdrawStatus.textContent = "✅ " + data.message;

        if (data.user) {
          balance = data.user.balance_usd;
          updateBalanceDisplay();
          $("ref-total").textContent = data.user.ref_count;
          $("ref-active").textContent = data.user.active_refs;
          $("ref-deposits").textContent = data.user.team_deposit_usd.toFixed(2) + " $";
        }
      }
    })
    .catch(err => {
      withdrawStatus.textContent = "❌ Սերվերի սխալ";
      console.error(err);
    });


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
      "user id չկա (Telegram WebApp-ից դուրս ես փորձարկում)";
  }
}

if (refCopyBtn) {
  refCopyBtn.addEventListener("click", () => {
    if (!refLinkInput) return;
    refLinkInput.select();
    document.execCommand("copy");
    showSuccessModal("✅ Կատարված է", "Հղումը պատճենված է հիշողության մեջ");
  });
}

initFromTelegram();
initReferralLink();
updateBalanceDisplay();

// ═══════════════════════════════════════════
// DOMIT/TON CHART (Lightweight Charts)
// ═══════════════════════════════════════════

let domitChart;
let domitCandleSeries;

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
});

const portalOrb = document.getElementById("portal-orb");
if (portalOrb) {
  portalOrb.addEventListener("click", function() {
    if (!CURRENT_USER_ID) return;
    window.location.href = window.location.origin + '/portal/portal.html?uid=' + CURRENT_USER_ID + '&viewer=' + CURRENT_USER_ID;
  });
}

// 🔌 Socket.IO Real-time Connection
const socket = io();
let lastCandleTime = 0;  // ✅ Track վերջին candle-ի ժամանակը

socket.on('connect', () => {
  console.log('🟢 Realtime connected');
  socket.emit('join_chart');  // ✅ Join chart room
  console.log('📊 Joined chart_viewers room');
});

socket.on('domit_update', (data) => {
  console.log('📊 DOMIT Update:', data);
  if (domitCandleSeries) {
    domitCandleSeries.update(data);
    lastCandleTime = data.time;
    
    // ✅ Update price display
    const currentEl = document.getElementById('domit-current');
    if (currentEl) {
      currentEl.textContent = Number(data.close).toFixed(4);
    }
    
    // ✅ Update change % in real-time
    const changeEl = document.getElementById('domit-change');
    if (changeEl && window.firstCandleOpen) {
      const change = ((data.close - window.firstCandleOpen) / window.firstCandleOpen * 100).toFixed(2);
      changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
      changeEl.style.color = change >= 0 ? '#26a69a' : '#ef5350';
    }
  }
});

socket.on('new_candle', (data) => {
  console.log('🕐 New Candle:', data);
  if (domitCandleSeries && data.time !== lastCandleTime) {
    // ✅ Add new candle
    domitCandleSeries.update(data);
    lastCandleTime = data.time;
    
    // ✅ Auto-scroll and fit content
    if (domitChart) {
      domitChart.timeScale().scrollToRealTime();
      domitChart.timeScale().fitContent();
    }
  }
});
