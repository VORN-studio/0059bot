const tg  = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID     = null;
let mainBalance = 0;   // DOMINO main balance (DB-ից)
let slotsBalance = 0;  // Slots balance (միայն front-end-ի մեջ)

let spinning = false;

// ============ HELPERS ============
function $(id) {
  return document.getElementById(id);
}

function updateBalances() {
  $("main-balance").textContent  = mainBalance.toFixed(2);
  $("slots-balance").textContent = slotsBalance.toFixed(2);
}

function showStatus(msg) {
  $("status").textContent = msg;
}

// UID from URL կամ Telegram
function getUidFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid"));
}

// Բեռնում ենք օգտատիրոջ հիմնական բալանսը
async function loadUser() {
  try {
    const r  = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();

    if (!js.ok) return;

    mainBalance = js.user.balance_usd;
    updateBalances();
  } catch (e) {
    console.log("load error", e);
  }
}

// INIT
window.onload = () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  loadUser();
};

// ============ DEPOSIT MODAL ============
function openDepositModal() {
  $("slot-deposit-input").value = "";
  $("slot-deposit-error").textContent = "";
  $("slot-deposit-modal").classList.remove("hidden");
}

function closeDepositModal() {
  $("slot-deposit-modal").classList.add("hidden");
}

// Դեպոզիտ Slots-ում (DB → mainBalance–ից հանում է, front–ում slotsBalance–ին գումարում)
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

    // backend-ը only main balance-ն ա թարմացնում, slots_balance-ը պահում ենք front-end-ում
    mainBalance   = js.new_main;
    slotsBalance += amount;

    updateBalances();
    showStatus(`➕ ${amount}$ փոխանցվեց Slots balance`);

  } catch (e) {
    console.log(e);
    showStatus("❌ Սերվերի սխալ");
  }
}

// Վերադարձնել ամբողջ slotsBalance-ը հիմնական բալանսին
async function withdrawFromSlots() {
  if (slotsBalance <= 0) return showStatus("Slots balance = 0");

  const amount = slotsBalance;

  try {
    const r = await fetch(`${API}/api/slots/withdraw`, {
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
    console.log(e);
    showStatus("❌ Սերվերի սխալ");
  }
}

// ============ 777 CLASSIC GAME ENGINE ============

const symbols  = ["🍒", "⭐", "7️⃣", "💎", "🔔"];
const WIN_RATE = 0.65; // մոտ 65% դեպքերում user-ը ՊԱՐՏՎՈՒՄ ա (bot win)


// ====== CONFIG — controlled win chances ======

const multipliers = {
  "7️⃣": 3.4,
  "💎": 2.4,
  "⭐": 1.8,
  "🔔": 1.2,
  "🍒": 0.8
};

// տոկոսները (պետք է միասին լինեն 100)
const winChances = {
  "7️⃣": 2,   // 2% шанс ընկնելու
  "💎": 4,
  "⭐": 6,
  "🔔": 8,
  "🍒": 10,
  "LOSE": 70 // պարտություն
};

function chooseOutcome() {
  const r = Math.random() * 100;
  let acc = 0;

  for (let key in winChances) {
    acc += winChances[key];
    if (r <= acc) return key;
  }
  return "LOSE";
}


function checkCombo(a, b, c, bet) {
  if (a === b && b === c && multipliers[a]) {
    return bet * multipliers[a];
  }
  return 0;
}


// random սիմվոլ
function getRandomSymbol() {
  return symbols[Math.floor(Math.random() * symbols.length)];
}

// Որոշում ենք՝ user-ը հաղթո՞ւմ է, թե՞ ոչ
function determineResult() {
  const r = Math.random();
  return r > WIN_RATE; // true → user wins
}

// Reel–ի animation + վերջնական սիմվոլ
function spinReel(reelId, finalSymbol) {
  return new Promise((resolve) => {
    const reel = $(reelId);

    reel.classList.add("spinning");

    let ticks    = 0;
    let maxTicks = 20 + Math.floor(Math.random() * 10);

    const timer = setInterval(() => {
      reel.textContent = getRandomSymbol();
      ticks++;

      if (ticks >= maxTicks) {
        clearInterval(timer);

        setTimeout(() => {
          reel.classList.remove("spinning");
          reel.textContent = finalSymbol;
          resolve();
        }, 150);
      }
    }, 80);
  });
}

function openInfo() {
  $("info-modal").classList.remove("hidden");
}

function closeInfo() {
  $("info-modal").classList.add("hidden");
}


// Հիմնական spin ֆունկցիա
async function spin() {
  if (spinning) return;
  spinning = true;
  showStatus("");

  const bet = Number($("bet").value);

  if (!bet || bet <= 0) {
    spinning = false;
    return showStatus("❌ Գրել ճիշտ գումար");
  }

  if (bet > slotsBalance) {
    spinning = false;
    return showStatus("❌ Slots balance չի հերիքում");
  }

  // Հանում ենք bet-ը slotsBalance-ից
  slotsBalance -= bet;
  updateBalances();

  // STEP 1 — outcome ընտրել admin–ի տոկոսներով
const outcome = chooseOutcome();

// STEP 2 — build reels
let resultSymbols;

if (outcome === "LOSE") {
  resultSymbols = [
    getRandomSymbol(),
    getRandomSymbol(),
    getRandomSymbol()
  ];
} else {
  resultSymbols = [outcome, outcome, outcome];
}



  // 2) Պտտում ենք reels–ները
  await spinReel("r1", resultSymbols[0]);
  await spinReel("r2", resultSymbols[1]);
  await spinReel("r3", resultSymbols[2]);

  // 3) Հաղթում / պարտություն
let reward = 0;

if (outcome !== "LOSE") {
  reward = bet * multipliers[outcome];
  slotsBalance += reward;
  updateBalances();
  showStatus(`🟢 Հաղթեցիր ${reward.toFixed(2)}$`);
} else {
  showStatus("💔 Պարտվեցիր");
}

updateBalances();



  spinning = false;
}

// ============ BACK ============
async function goBack() {
  // Եթե slotsBalance > 0, նախ վերադարձնենք հիմնական բալանսին
  if (slotsBalance > 0) {
    await withdrawFromSlots();
  }

  // հետո վերադառնում ենք slots lobby
  window.location.href =
    `${window.location.origin}/webapp/games/slots.html?uid=${USER_ID}`;
}
