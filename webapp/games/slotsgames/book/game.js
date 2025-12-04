const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let mainBalance = 0;
let slotsBalance = 0;
let spinning = false;

// կարճ helper
function $(id) { return document.getElementById(id); }

function updateBalances() {
  $("main-balance").textContent = mainBalance.toFixed(2);
  $("slots-balance").textContent = slotsBalance.toFixed(2);
}

function setStatus(text, type = "") {
  const el = $("status");
  el.textContent = text || "";
  el.classList.remove("win", "lose");
  if (type) el.classList.add(type);
}

// uid
function getUidFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid") || 0);
}

// բալանսի բեռնում backend-ից
async function loadUser() {
  try {
    if (!USER_ID) return;
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    if (!js.ok) return;
    mainBalance = Number(js.user.balance_usd || 0);
    updateBalances();
  } catch (e) {
    console.log("loadUser error", e);
  }
}

/* ========== ԴԵՊՈԶԻՏ / ՎԵՐԱԴԱՐՁ ========== */

function openDepositModal() {
  $("slot-deposit-input").value = "";
  $("slot-deposit-error").textContent = "";
  $("slot-deposit-modal").classList.remove("hidden");
}

function closeDepositModal() {
  $("slot-deposit-modal").classList.add("hidden");
}

async function confirmDeposit() {
  const raw = $("slot-deposit-input").value;
  const amount = Number(raw);

  if (!amount || amount <= 0) {
    $("slot-deposit-error").textContent = "Գրիր ճիշտ գումար";
    return;
  }
  if (amount > mainBalance) {
    $("slot-deposit-error").textContent = "Չունես այդքան գումար";
    return;
  }

  $("slot-deposit-error").textContent = "";
  closeDepositModal();

  try {
    const r = await fetch(`${API}/api/slots/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, amount }),
    });
    const js = await r.json();
    if (!js.ok) {
      setStatus("❌ Backend սխալ (deposit)", "lose");
      return;
    }

    mainBalance = Number(js.new_main || 0);
    slotsBalance += amount;
    updateBalances();
    setStatus(`➕ ${amount.toFixed(2)} փոխանցվեց Slots բալանս`, "win");
  } catch (e) {
    console.log("deposit error", e);
    setStatus("❌ Սերվերի սխալ", "lose");
  }
}

async function withdrawFromSlots(silent = false) {
  if (slotsBalance <= 0) {
    if (!silent) setStatus("Slots բալանսը = 0");
    return;
  }

  const amount = slotsBalance;

  try {
    const r = await fetch(`${API}/api/slots/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, amount }),
    });
    const js = await r.json();
    if (!js.ok) {
      if (!silent) setStatus("❌ Backend սխալ (withdraw)", "lose");
      return;
    }

    mainBalance = Number(js.new_main || 0);
    slotsBalance = 0;
    updateBalances();
    if (!silent) setStatus("⬅ Գումարը վերադարձվեց հիմնական բալանս", "win");
  } catch (e) {
    console.log("withdraw error", e);
    if (!silent) setStatus("❌ Սերվերի սխալ", "lose");
  }
}

/* ========== ԻՆՖՈ ՄՈԴԱԼ ========== */

function openInfo() { $("info-modal").classList.remove("hidden"); }
function closeInfo() { $("info-modal").classList.add("hidden"); }

/* ========== ԽԱՂԻ ՄԱՍ – 5×3 GRID ========== */

const ROWS = 3;
const COLS = 5;

const SYMBOLS = ["10", "J", "Q", "K", "A", "BOOK"];

const SYMBOL_EMOJI = {
  "10": "🔹",
  "J":  "🟦",
  "Q":  "💠",
  "K":  "🟨",
  "A":  "⭐",
  "BOOK": "📖",
};

// «գիրքը» մի քիչ հազվադեպ
function randomSymbol() {
  const r = Math.random();
  if (r < 0.08) return "BOOK";     // 8%
  if (r < 0.26) return "A";
  if (r < 0.46) return "K";
  if (r < 0.66) return "Q";
  if (r < 0.86) return "J";
  return "10";
}

// լցնում ենք դաշտը random սիմվոլներով և նկարում DOM-ի վրա
function fillGrid() {
  const grid = [];

  for (let row = 0; row < ROWS; row++) {
    grid[row] = [];
    for (let col = 0; col < COLS; col++) {
      const sym = randomSymbol();
      grid[row][col] = sym;

      const cell = document.querySelector(
        `.cell[data-row="${row}"][data-col="${col}"]`
      );
      if (cell) cell.textContent = SYMBOL_EMOJI[sym] || sym;
    }
  }
  return grid;
}

function startSpinAnimation() {
  document.querySelectorAll(".book-reel").forEach((el, i) => {
    setTimeout(() => el.classList.add("spinning"), i * 70);
  });
}

function stopSpinAnimation() {
  document.querySelectorAll(".book-reel").forEach((el) =>
    el.classList.remove("spinning")
  );
}

async function spin() {
  if (spinning) return;

  const bet = Number($("bet-input").value);

  if (!bet || bet <= 0) {
    setStatus("Գրիր ճիշտ գումար", "lose");
    return;
  }
  if (bet > slotsBalance) {
    setStatus("Չունես այդքան Slots բալանս", "lose");
    return;
  }

  slotsBalance -= bet;
  updateBalances();
  setStatus("Պտտում ենք...", "");

  spinning = true;
  $("spin-btn").disabled = true;
  startSpinAnimation();

  // փոքր դիլեյ, որ ֆռալը երևա
  await new Promise((res) => setTimeout(res, 650));

  const grid = fillGrid();
  stopSpinAnimation();

  // 🔥 առայժմ հաշվում ենք ՄԻԱՅՆ ՄԻՋԱՆԿՅԱԼ ԳԾԸ (row = 1)
  const middleRow = grid[1];
  let win = 0;

  const allSame = middleRow.every((s) => s === middleRow[0]);

  if (allSame && middleRow[0] === "BOOK") {
    win = bet * 12;
  } else if (allSame) {
    win = bet * 6;
  } else {
    const books = middleRow.filter((s) => s === "BOOK").length;
    if (books === 4) win = bet * 5;
    else if (books === 3) win = bet * 3;
    else if (books === 2) win = bet * 1.2;
  }

  if (win > 0) {
    slotsBalance += win;
    updateBalances();
    setStatus(`🥳 Հաղթեցիր ${win.toFixed(2)} DOMT`, "win");
  } else {
    setStatus("😶 Այս անգամ ոչինչ չընկավ", "lose");
  }

  spinning = false;
  $("spin-btn").disabled = false;
}

/* ========== ՎԵՐԱԴԱՌՆԱԼ ՍԼՈՏՍ ՄԵՆՅՈՒ ========== */

async function goBack() {
  if (slotsBalance > 0) {
    await withdrawFromSlots(true);
  }
  window.location.href =
    `${window.location.origin}/webapp/slots.html?uid=${USER_ID}`;
}

/* ========== INIT ========== */

window.addEventListener("load", () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  if (!USER_ID) {
    setStatus("Չհաջողվեց ստանալ user id", "lose");
    return;
  }
  loadUser();
  updateBalances();
});
