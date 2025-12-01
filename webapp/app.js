// ============ TON CONNECT INIT ============

// TON Connect controller (SDK)
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: "https://vorn-studio.github.io/0059bot/webapp/tonconnect-manifest.json",
  buttonRootId: "ton-connect",
});

// TON wallet address
let TON_WALLET = null;

// When user connects wallet (popup)
tonConnectUI.onStatusChange((walletInfo) => {
  if (walletInfo && walletInfo.account) {
    TON_WALLET = walletInfo.account.address;
    console.log("💎 TON Wallet Connected:", TON_WALLET);

    // ցույց տանք user-ին
    const walletStatus = document.getElementById("wallet-status");
    if (walletStatus) {
      walletStatus.textContent = "Wallet connected: " + TON_WALLET;
    }

    // OPTIONAL — կարող ենք ավտոմատ կցել backend-ին
    // sendTonWalletToBackend(TON_WALLET);
  }
});

console.log("✅ Casino WebApp loaded");

// ================== TELEGRAM INIT ==================
const tg = window.Telegram && window.Telegram.WebApp;

// Քո backend-ի հիմքը (Render-ում կփոխենք իրական հղումով)
const API_BASE = "https://your-backend.onrender.com"; // ← հետո կփոխենք

// Օգտատիրոջ տվյալները կպահենք այստեղ
let CURRENT_USER_ID = null;
let CURRENT_USERNAME = null;

// 💰 balance-ը սկզբում 0 է, backend-ից ենք բերելու
let balance = 0.0;

// ---------------- HELPERS ----------------
function $(id) {
  return document.getElementById(id);
}

function updateUserHeader() {
  if ($("user-id")) $("user-id").textContent = CURRENT_USER_ID ?? "-";
  if ($("user-name")) $("user-name").textContent = CURRENT_USERNAME ?? "-";
}

function updateBalanceDisplay() {
  const el = $("user-balance");
  if (el) el.textContent = balance.toFixed(2) + " $";
}

// ---------------- LOAD FROM TELEGRAM ----------------
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
  } else {
    console.log("⚠️ user object չկա initDataUnsafe-ից");
  }

  updateUserHeader();
  updateBalanceDisplay();

  // Այստեղ կարող ենք backend-ից բալանսը վերցնել
  loadUserFromBackend();
}

// ---------------- LOAD USER FROM BACKEND (STRUCTURE) ----------------
async function loadUserFromBackend() {
  if (!CURRENT_USER_ID) {
    console.log("⛔ Չկա CURRENT_USER_ID, չենք կանչում backend-ը");
    return;
  }

  // Երբ Render + Neon պատրաստ լինեն, այստեղ API կանչ կանենք՝
  // օրինակ՝ GET /api/user/<telegram_id>
  const url = `${API_BASE}/api/user/${CURRENT_USER_ID}`;
  console.log("🌐 Կփորձենք բեռնել օգտատիրոջ տվյալները ՝", url);

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      console.log("⚠️ Backend returned non-OK:", res.status);
      return;
    }
    const data = await res.json();
    console.log("✅ User from backend:", data);

    // Սպասվող data կառուցվածքը (հետո backend-ում այդպես կանենք)
    // {
    //   ok: true,
    //   user: {
    //     balance: 123.45,
    //     wallet: "USDT...",
    //     ref_total: 5,
    //     ref_active: 2,
    //     ref_deposits: 250.0
    //   }
    // }

    if (data && data.ok && data.user) {
      if (typeof data.user.balance === "number") {
        balance = data.user.balance;
      }

      updateBalanceDisplay();

      // Referral stats (եթե կա)
      if ($("ref-total") && typeof data.user.ref_total === "number") {
        $("ref-total").textContent = data.user.ref_total;
      }
      if ($("ref-active") && typeof data.user.ref_active === "number") {
        $("ref-active").textContent = data.user.ref_active;
      }
      if ($("ref-deposits") && typeof data.user.ref_deposits === "number") {
        $("ref-deposits").textContent = data.user.ref_deposits.toFixed(2) + " $";
      }

      // Եթե user.wallet կա, կարող ենք լցնել wallet input-ը
      if ($("wallet-input") && data.user.wallet) {
        $("wallet-input").value = data.user.wallet;
      }
    }
  } catch (err) {
    console.log("❌ Սխալ backend-ի հետ կապվելիս:", err);
  }
}

// ---------------- NAVIGATION ----------------
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

// ---------------- WALLET SAVE (STRUCTURE) ----------------
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

    // Backend save structure (երբ Render պատրաստ լինի)
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
        // Թարմացնենք balance-ը, եթե backend-ը վերադարձնի նոր balance
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
        "Չստացվեց կապվել սերվերին։ Հետո Render-ում կաշխատի։";
    }
  });
}

// ---------------- DEPOSIT (դեռ ֆեյք, բայց պատրաստ կառուցվածքով) ----------------
const depositInput = $("deposit-amount");
const depositStatus = $("deposit-status");
const depositBtn = $("deposit-btn");

if (depositBtn) {
  depositBtn.addEventListener("click", async () => {
    const amount = Number(depositInput.value);
    if (!amount || amount <= 0) {
      depositStatus.textContent = "Գրիր ճիշտ գումար։";
      return;
    }
    if (!CURRENT_USER_ID) {
      depositStatus.textContent = "Telegram user ID չգտանք։";
      return;
    }

    depositStatus.textContent = "Deposit հարցումը ուղարկում ենք…";

    // Հետո backend-ում սա կաշխատի իրականով
    const url = `${API_BASE}/api/deposit_request`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: CURRENT_USER_ID,
          amount: amount,
        }),
      });

      if (!res.ok) {
        depositStatus.textContent = "Backend սխալ տվեց, հետո կսարքենք։";
        return;
      }

      const data = await res.json();
      if (data.ok) {
        depositStatus.textContent =
          "Deposit հարցումը գրանցված է ✅ (վերիֆիկացիան կլինի admin-ի կողմից)";
      } else {
        depositStatus.textContent =
          data.error || "Deposit-ը չստացվեց (backend պատասխան)։";
      }
    } catch (err) {
      console.log("❌ Deposit հարցման սխալ:", err);
      depositStatus.textContent =
        "Չստացվեց կապվել սերվերին։ Հետո Render-ում կաշխատի։";
    }
  });
}

// ---------------- WITHDRAW (միայն կառուցվածք) ----------------
const withdrawInput = $("withdraw-amount");
const withdrawStatus = $("withdraw-status");
const withdrawBtn = $("withdraw-btn");

if (withdrawBtn) {
  withdrawBtn.addEventListener("click", async () => {
    const amount = Number(withdrawInput.value);
    if (!amount || amount <= 0) {
      withdrawStatus.textContent = "Գրիր կանխիկացման գումարը։";
      return;
    }
    if (!CURRENT_USER_ID) {
      withdrawStatus.textContent = "Telegram user ID չգտանք։";
      return;
    }

    withdrawStatus.textContent = "Ստուգում ենք պայմանները…";

    const url = `${API_BASE}/api/withdraw_request`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: CURRENT_USER_ID,
          amount: amount,
        }),
      });

      if (!res.ok) {
        withdrawStatus.textContent = "Backend սխալ տվեց, հետո կսարքենք։";
        return;
      }

      const data = await res.json();
      if (data.ok) {
        withdrawStatus.textContent =
          "Withdraw հարցումը գրանցված է ✅ Admin-ը կվերահսկի։";
      } else {
        withdrawStatus.textContent =
          data.error ||
          "Չստացվեց withdraw անել։ Հավանաբար 10 ակտիվ ռեֆերալը կամ 200$ դեպոզիտը չեն լրացված։";
      }
    } catch (err) {
      console.log("❌ Withdraw error:", err);
      withdrawStatus.textContent =
        "Չստացվեց կապվել սերվերին։ Հետո Render-ում կաշխատի։";
    }
  });
}

// ---------------- REFERRAL LINK ----------------
const refLinkInput = $("ref-link");
const refCopyBtn = $("ref-copy-btn");

function initReferralLink() {
  if (!refLinkInput) return;

  if (CURRENT_USER_ID) {
    // այստեղ դնում ես ՔՈ բոտի username-ը
    const botUsername = "doominobot"; // ← փոխիր կոնկրետ քոնը, եթե ուրիշ է
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
    if (tg) tg.showPopup({ message: "Հղումը կոպի է արված ✅" });
  });
}

// ---------------- START ----------------
initFromTelegram();
initReferralLink();
updateBalanceDisplay();
