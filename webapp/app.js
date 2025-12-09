const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: "https://vorn-studio.github.io/0059bot/webapp/tonconnect-manifest.json",
  buttonRootId: "ton-connect",
});

let TON_WALLET = null;

tonConnectUI.onStatusChange((walletInfo) => {
  if (walletInfo && walletInfo.account) {
    TON_WALLET = walletInfo.account.address;
    console.log("💎 TON Wallet Connected:", TON_WALLET);

    const walletStatus = document.getElementById("wallet-status");
    if (walletStatus) {
      const short = TON_WALLET.slice(0, 6) + "..." + TON_WALLET.slice(-4);
      walletStatus.textContent = "Wallet connected: " + short;
    }
  }
});

console.log("✅ Casino WebApp loaded");
const tg = window.Telegram && window.Telegram.WebApp;
const API_BASE = "https://domino-backend-iavj.onrender.com"; // ← հետո կփոխենք
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
  if (el) el.textContent = balance.toFixed(2) + " $";
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

        const claimedDomit = data.claimed_domit || 0;
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

    window.location.href = `${window.location.origin}/portal/portal.html?uid=${uid}`;
}


function openTasks() {
    const url = "/webapp/tasks/index.html?uid=" + CURRENT_USER_ID;
    if (window.Telegram && Telegram.WebApp) {
        window.location.href = url;  
        return;
    }
    window.location.href = `https://domino-backend-iavj.onrender.com${url}`;
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
  } else {
    console.log("⚠️ user object չկա initDataUnsafe-ից");
  }

  updateUserHeader();
  updateBalanceDisplay();
  loadUserFromBackend();
}

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

    $("user-id").textContent = CURRENT_USER_ID;
    $("user-name").textContent = U.username || "-";
    $("user-balance").textContent = U.balance_usd.toFixed(2) + " $";
    balance = U.balance_usd;
    document.getElementById("ton-current").textContent = U.ton_balance.toFixed(4);

    $("ref-total").textContent = U.ref_count;
    $("ref-active").textContent = U.active_refs;
    $("ref-deposits").textContent = U.team_deposit_usd.toFixed(2) + " $";

    const botUsername = "doominobot"; 
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
function openMining() {
    window.location.href = "https://domino-backend-iavj.onrender.com/webapp/mining/index.html?uid=" + CURRENT_USER_ID;
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
        "Չստացվեց կապվել սերվերին։ Հետո Render-ում կաշխատի։";
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
    if (tg) tg.showPopup({ message: "Հղումը կոպի է արված ✅" });
  });
}

initFromTelegram();
initReferralLink();
updateBalanceDisplay();

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

