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
      const short = TON_WALLET.slice(0, 6) + "..." + TON_WALLET.slice(-4);
      walletStatus.textContent = "Wallet connected: " + short;
    }

    // OPTIONAL — կարող ենք ավտոմատ կցել backend-ին
    // sendTonWalletToBackend(TON_WALLET);
  }
});

console.log("✅ Casino WebApp loaded");

// ================== TELEGRAM INIT ==================
const tg = window.Telegram && window.Telegram.WebApp;

// Քո backend-ի հիմքը (Render-ում կփոխենք իրական հղումով)
const API_BASE = "https://domino-backend-iavj.onrender.com"; // ← հետո կփոխենք

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

async function loadTonRate() {
    try {
        const res = await fetch(`${API_BASE}/api/ton_rate`);
        const data = await res.json();

        if (data.ok) {
            const rate = data.ton_usd;

            // ԱՅՍՏԵՂ — ԳՐՈՒՄ ԵՍ ՃԻՇՏ span-ի մեջ
            document.getElementById("ton-current").textContent = rate.toFixed(4);
        } else {
            document.getElementById("ton-current").textContent = "—";
        }
    } catch (e) {
        document.getElementById("ton-current").textContent = "—";
    }
}


function openTasks() {
    window.location.href = "/webapp/tasks/index.html?uid=" + CURRENT_USER_ID;
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

    const U = data.user;

    // ---------------------
    // 1) HEADER FIELDS
    // ---------------------

    $("user-id").textContent = CURRENT_USER_ID;
    $("user-name").textContent = U.username || "-";
    $("user-balance").textContent = U.balance_usd.toFixed(2) + " $";
    balance = U.balance_usd;
    document.getElementById("ton-current").textContent = U.ton_balance.toFixed(4);



    // ---------------------
    // 2) REFERRAL STATS
    // ---------------------

    $("ref-total").textContent = U.ref_count;
    $("ref-active").textContent = U.active_refs;
    $("ref-deposits").textContent = U.team_deposit_usd.toFixed(2) + " $";


    // ---------------------
    // 3) GENERATE REF LINK
    // ---------------------
    const botUsername = "doominobot"; // փոխիր եթե բոտդ ուրիշ անուն ունի
    $("ref-link").value =
      `https://t.me/${botUsername}?start=ref_${CURRENT_USER_ID}`;

    console.log("✔ User loaded OK");

  } catch (err) {
    console.log("❌ loadUser error:", err);
  }
}

function openCrash() {
    window.location.href = "https://domino-backend-iavj.onrender.com/webapp/games/crash.html?uid=" + CURRENT_USER_ID;
}
function openDice() {
    window.location.href = "https://domino-backend-iavj.onrender.com/webapp/games/dice.html?uid=" + CURRENT_USER_ID;
}
function openSlots() {
    window.location.href = "https://domino-backend-iavj.onrender.com/webapp/games/slots.html?uid=" + CURRENT_USER_ID;
}
function openCoinflip() {
    window.location.href = "https://domino-backend-iavj.onrender.com/webapp/games/coinflip.html?uid=" + CURRENT_USER_ID;
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
      depositStatus.textContent = "Գրիր ճիշտ TON գումար։";
      return;
    }

    if (!TON_WALLET) {
      depositStatus.textContent = "Կցրու քո TON Wallet-ը։";
      return;
    }

    depositStatus.textContent = "Բացում ենք TON վճարման popup-ը…";

    const RECEIVER_TON_ADDRESS = "UQC0hJAYzKWuRKVnUtu_jeHgbyxznehBllc63azIdeoPUBfW"; // ← ԱՅՍՏԵՂ ԴՆԵՍ ՔՈ TON ՀԱՍՑԵՆ

    try {
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300, // 5 րոպե
        messages: [
          {
            address: RECEIVER_TON_ADDRESS,
            amount: (amount * 1e9).toString(), // TON → nanotons
          },
        ],
      });

      // Եթե user-ը ուղարկեց TON
      console.log("TON Transaction:", result);

      depositStatus.textContent =
        "Դեպոզիտը ուղարկված է։ Tx hash: " + result.boc.slice(0, 10) + "...";

      // Այստեղ հետո կուղարկենք backend-ին փաստաթուղթը
      // sendDepositToBackend(result);

    } catch (err) {
      console.log("❌ TON popup error:", err);
      depositStatus.textContent = "Օգտատերը չեղարկեց կամ սխալ առաջացավ։";
    }
  });
}


// ---------------- WITHDRAW (միայն կառուցվածք) ----------------
const withdrawInput = $("withdraw-amount");
const withdrawStatus = $("withdraw-status");
const withdrawBtn = $("withdraw-btn");

if (withdrawBtn) {
  withdrawBtn.addEventListener("click", () => {

    const amount = Number(withdrawInput.value);

    // 1) Սխալ գումար
    if (!amount || amount <= 0) {
      withdrawStatus.textContent = "❌ Գումարը գրեք ճիշտ։";
      return;
    }

    // 2) Telegram user ID չգտանք
    if (!CURRENT_USER_ID) {
      withdrawStatus.textContent = "❌ Բացեք WebApp-ը բոտի միջից, ոչ թե browser-ից։";
      return;
    }

    // 3) Balance check
    if (amount > balance) {
      withdrawStatus.textContent = "❌ Ձեր գրած գումարը գերազանցում է ձեր բալանսը։";
      return;
    }

    // 4) Referral conditions check
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

    // 5) Եթե ամեն ինչ OK է → success message
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

    // Balance update
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
//loadTonRate();
//setInterval(loadTonRate, 60000);

function loadTonChart() {
  new TradingView.widget({
    "width": "100%",
    "height": 250,
    "symbol": "TONUSD",
    "interval": "30",
    "timezone": "Etc/UTC",
    "theme": "dark",
    "style": "1",
    "locale": "en",
    "container_id": "ton-chart"
  });
}

loadTonChart();

//loadTonRate();
//setInterval(loadTonRate, 15000); // ամեն 15 վրկ մեկ թարմացնի
