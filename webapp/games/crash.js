// Crash Game — Domino style

const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin || "https://domino-backend-iavj.onrender.com";

let USER_ID = null;

let mainBalance = 0;   // հիմնական բալանս (backend-ից)
let crashBalance = 0;  // խաղի ներսի բալանս (մինչև backend ինտեգրումը՝ միայն client-side)

let multiplier = 1.0;
let running = false;
let crashed = false;
let timer = null;
let currentBet = 0;

// ───────────────────────────────── HELPERS ──────────────────────────────

function getUidFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("uid");
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function setDominoState(state) {
  const d = document.getElementById("domino");
  if (!d) return;
  d.classList.remove("flying", "crashed");
  if (state === "flying") d.classList.add("flying");
  if (state === "crashed") d.classList.add("crashed");
}

function updateBalances() {
  document.getElementById("main-balance").textContent = mainBalance.toFixed(2);
  document.getElementById("crash-balance").textContent = crashBalance.toFixed(2);
}

function setMultiplierView() {
  const el = document.getElementById("multiplier");
  el.textContent = multiplier.toFixed(2) + "x";
  el.style.transform = "scale(1.08)";
  setTimeout(() => (el.style.transform = "scale(1)"), 80);
}

function show(msg) {
  document.getElementById("status").innerHTML = msg;
}

// ───────────────────────────── LOAD USER / BALANCE ──────────────────────

async function loadUser() {
  if (!USER_ID) return;

  try {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    if (!js.ok || !js.user) return;

    mainBalance = js.user.balance_usd || 0;
    if (!crashBalance) crashBalance = 0;
    updateBalances();
  } catch (e) {
    console.log("loadUser error:", e);
  }
}

// ───────────────────────────── DEPOSIT / WITHDRAW ───────────────────────

function depositToCrash() {
  if (!mainBalance) {
    return show("❌ Նախ գլխավորը լցրու բալանսով․ Deposit մենյուից։");
  }

  const raw = prompt("Գումարը ($), որը ուզում ես խաղա՛լ Crash-ում:");
  const amount = Number(raw);

  if (!amount || amount <= 0) {
    return show("❌ Գրիր ճիշտ գումար");
  }
  if (amount > mainBalance) {
    return show("❌ Այդքան գումար չունես հիմնական բալանսում");
  }

  crashBalance += amount;
  updateBalances();
  show("✅ Crash balance-ը ավելացավ " + amount.toFixed(2) + " $-ով");
}

function withdrawFromCrash() {
  if (crashBalance <= 0) {
    return show("❌ Crash balance = 0");
  }
  crashBalance = 0;
  updateBalances();
  show("✅ Crash balance-ը վերադարձվեց որպես «չօգտագործված» գումար");
}

// ───────────────────────────── START GAME ───────────────────────────────

function startCrash() {
  if (running) return;

  const betInput = document.getElementById("bet");
  const bet = Number(betInput.value);

  if (!bet || bet <= 0) {
    return show("❌ Գրիր ճիշտ գումար");
  }

  // Bet-ը պետք է լինի և՛ հիմնականից, և՛ crash-balance-ից
  if (bet > mainBalance) {
    return show("❌ Բալանսը բավարար չէ");
  }
  if (crashBalance <= 0 || bet > crashBalance) {
    return show("❌ Crash balance-ը չի հերիքում (սեղմիր «Դեպոզիտ Crash»)");
  }

  running = true;
  crashed = false;
  currentBet = bet;

  multiplier = 1.0;
  setMultiplierView();
  setDominoState("flying");
  show("🎮 Խաղը սկսվեց — սպասիր ճիշտ պահին Claim անելուն");

  document.getElementById("start-btn").style.display = "none";
  document.getElementById("cashout-btn").style.display = "block";

  // Էֆեկտ — multiplier-ի աճ + պատահական crash
  timer = setInterval(() => {
    multiplier += 0.015 + Math.random() * 0.04; // արագությունը
    setMultiplierView();

    // crash probability (կախված multiplier-ից)
    const chance = 0.012 * multiplier;
    if (Math.random() < chance) {
      crashNow();
    }
  }, 90);
}

// ───────────────────────────── CRASH EVENT ──────────────────────────────

function crashNow() {
  if (!running) return;

  running = false;
  crashed = true;
  clearInterval(timer);

  setDominoState("crashed");

  // կորցնում ենք միայն crash balance-ից
  crashBalance -= currentBet;
  if (crashBalance < 0) crashBalance = 0;
  updateBalances();

  document.getElementById("cashout-btn").style.display = "none";
  document.getElementById("start-btn").style.display = "block";

  show("💥 Crash! Չհասցրիր Claim անել — բեթը այրվեց");
}

// ───────────────────────────── CLAIM / CASHOUT ──────────────────────────

async function cashOut() {
  if (!running || crashed) return;

  running = false;
  clearInterval(timer);
  setDominoState(null);

  const bet = currentBet;
  const winAmount = bet * multiplier;

  show("💸 Հաշվում ենք շահումը…");

  try {
    const res = await fetch(`${API}/api/game/bet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        amount: bet,
        game: "crash",
        choice: multiplier, // backend-ի համար multiplier-ը
      }),
    });

    const js = await res.json();

    if (js.ok) {
      // backend-ի նոր հիմնական balance
      mainBalance = js.new_balance || mainBalance;

      // crash balance-ի թարմացում՝ հին բեթը դուրս, շահումը ներս
      crashBalance = crashBalance - bet + winAmount;
      if (crashBalance < 0) crashBalance = 0;

      updateBalances();
      show("🟢 Հաջող Claim! +" + winAmount.toFixed(2) + " $");
    } else {
      show("❌ Backend error (game_bet)");
    }
  } catch (e) {
    console.log("cashOut error:", e);
    show("❌ Սերվերի սխալ");
  }

  document.getElementById("cashout-btn").style.display = "none";
  document.getElementById("start-btn").style.display = "block";
}

// ───────────────────────────── BACK TO MAIN ─────────────────────────────

function goBack() {
  // վերադառնում ենք Domino WebApp-ի գլխավոր մենյուին
  const base = window.location.origin;
  const uid = USER_ID || getUidFromUrl() || "";
  window.location.href = `${base}/app?uid=${uid}`;
}

// ───────────────────────────── INIT ─────────────────────────────────────

function initCrash() {
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    USER_ID = tg.initDataUnsafe.user.id;
  } else {
    USER_ID = getUidFromUrl();
  }

  if (!USER_ID) {
    show("⚠️ USER_ID չկա (փորձիր բացել բոտի միջից)");
    return;
  }

  if (tg) {
    tg.ready();
    tg.expand();
  }

  loadUser();
  setMultiplierView();
  setDominoState(null);
}

window.addEventListener("load", initCrash);
