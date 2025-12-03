const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let mainBalance = 0;
let slotsBalance = 0;

let spinning = false;

// ============ HELPERS ============
function $(id) {
  return document.getElementById(id);
}

function updateBalances() {
  $("main-balance").textContent = mainBalance.toFixed(2);
  $("slots-balance").textContent = slotsBalance.toFixed(2);
}

function showStatus(msg) {
  $("status").textContent = msg;
}

function showGameStatus(msg) {
  $("game-status").textContent = msg;
}

// ============ INIT ============
function getUidFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid"));
}

async function loadUser() {
  try {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();

    if (!js.ok) return;

    mainBalance = js.user.balance_usd;
    updateBalances();
  } catch (e) {
    console.log("load error", e);
  }
}

window.onload = () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  loadUser();
};

// ============ NAVIGATION ============
function openSlot(name) {
  $("slot-lobby").classList.remove("active");
  $("slot-game").classList.add("active");
}

// ============ DEPOSIT ============
// ============ SLOT DEPOSIT ============

function openDepositModal() {
  $("slot-deposit-input").value = "";
  $("slot-deposit-error").textContent = "";
  $("slot-deposit-modal").classList.remove("hidden");
}

function closeDepositModal() {
  $("slot-deposit-modal").classList.add("hidden");
}

async function confirmDeposit() {
  const amount = Number($("slot-deposit-input").value);

  if (!amount || amount <= 0) {
    $("slot-deposit-error").textContent = "Գրիր ճիշտ գումար";
    return;
  }

  if (amount > mainBalance) {
    $("slot-deposit-error").textContent = "Չունես այդքան գումար";
    return;
  }

  closeDepositModal();

  try {
    const r = await fetch(`${API}/api/slots/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, amount })
    });

    const js = await r.json();
    if (!js.ok) return showStatus("❌ Backend error");

    mainBalance = js.new_main;
    slotsBalance += amount;

    updateBalances();
    showStatus(`➕ ${amount}$ փոխանցվեց Slots balance`);
  } catch (e) {
    showStatus("❌ Սերվերի սխալ");
  }
}


async function withdrawFromSlots() {
  if (slotsBalance <= 0) return showStatus("Slots balance = 0");

  const amount = slotsBalance;

  try {
    const r = await fetch(`${API}/api/slots/withdraw`, { // same logic
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, amount })
    });

    const js = await r.json();
    if (!js.ok) return showStatus("Backend error");

    mainBalance += amount;
    slotsBalance = 0;
    updateBalances();
    showStatus("⬅ Գումարը վերադարձվեց հիմնական բալանս");
  } catch (e) {
    showStatus("❌ Սերվերի սխալ");
  }
}

// ============ SLOT GAME ENGINE ============

const symbols = ["🍒", "⭐", "7️⃣", "💎", "🔔"];

const WIN_RATE = 0.65; // bot wins ~65%

function getRandomSymbol() {
  return symbols[Math.floor(Math.random() * symbols.length)];
}

function determineResult() {
  const r = Math.random();
  return r > WIN_RATE; // true → user wins
}

function spinReel(reelId) {
  return new Promise((resolve) => {
    const reel = $(reelId);
    let count = 0;

    const interval = setInterval(() => {
      reel.textContent = getRandomSymbol();
      count++;
      if (count >= 15) {
        clearInterval(interval);
        resolve();
      }
    }, 80);
  });
}

async function spin() {
  if (spinning) return;
  spinning = true;
  showGameStatus("");

  const bet = Number($("bet").value);
  if (!bet || bet <= 0) {
    spinning = false;
    return showGameStatus("❌ Գրել ճիշտ գումար");
  }

  if (bet > slotsBalance) {
    spinning = false;
    return showGameStatus("❌ Slots balance չի հերիքում");
  }

  slotsBalance -= bet;
  updateBalances();

  const userWins = determineResult();

  await spinReel("r1");
  await spinReel("r2");
  await spinReel("r3");

  let resultSymbols;

  if (userWins) {
    const winSym = "7️⃣";
    resultSymbols = [winSym, winSym, winSym];
  } else {
    resultSymbols = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
  }

  $("r1").textContent = resultSymbols[0];
  $("r2").textContent = resultSymbols[1];
  $("r3").textContent = resultSymbols[2];

  if (userWins) {
    const reward = bet * 3.4;
    slotsBalance += reward;
    updateBalances();
    showGameStatus(`🟢 Հաղթեցիր ${reward.toFixed(2)}$`);
  } else {
    showGameStatus("💔 Պարտվեցիր");
  }

  spinning = false;
}

// ============ BACK ============
async function goBack() {
  if (slotsBalance > 0) await withdrawFromSlots();
  window.location.href = `${window.location.origin}/app?uid=${USER_ID}&t=${Date.now()}`;
}
