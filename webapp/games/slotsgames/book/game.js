const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let mainBalance = 0;
let slotsBalance = 0;
let spinning = false;

// helpers
function $(id) {
  return document.getElementById(id);
}

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

// UID
function getUidFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid") || 0);
}

// load main balance from backend
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

// ========== DEPOSIT MODAL ==========
function openDepositModal() {
  $("slot-deposit-input").value = "";
  $("slot-deposit-error").textContent = "";
  $("slot-deposit-modal").classList.remove("hidden");
}

function closeDepositModal() {
  $("slot-deposit-modal").classList.add("hidden");
}

// confirm deposit -> backend /api/slots/deposit
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

// withdraw all slots -> backend /api/slots/withdraw
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

// ========== INFO MODAL ==========
function openInfo() {
  $("info-modal").classList.remove("hidden");
}
function closeInfo() {
  $("info-modal").classList.add("hidden");
}

// ========== GAME LOGIC (5 reels) ==========

const SYMBOLS = ["10", "J", "Q", "K", "A", "📖"];
const SYMBOL_EMOJI = {
  "10": "🔹",
  "J": "🟦",
  "Q": "💠",
  "K": "🟨",
  "A": "⭐",
  "📖": "📖",
};

// random symbol with քիչ ավելի հազվադեպ գրքույկ
function randomSymbol() {
  const roll = Math.random();
  if (roll < 0.08) return "📖";      // 8% «գիրք»
  if (roll < 0.26) return "A";
  if (roll < 0.46) return "K";
  if (roll < 0.66) return "Q";
  if (roll < 0.86) return "J";
  return "10";
}

function setReelSymbol(idx, symbol) {
  const el = $(`reel-${idx}`);
  if (!el) return;
  el.textContent = SYMBOL_EMOJI[symbol] || symbol;
}

// main spin
async function spin() {
  if (spinning) return;

  const rawBet = $("bet-input").value;
  const bet = Number(rawBet);

  if (!bet || bet <= 0) {
    setStatus("Գրիր ճիշտ գումար", "lose");
    return;
  }
  if (bet > slotsBalance) {
    setStatus("Չունես այդքան Slots բալանս", "lose");
    return;
  }

  // take bet
  slotsBalance -= bet;
  updateBalances();
  setStatus("Պտտում ենք...", "");

  spinning = true;
  $("spin-btn").disabled = true;

  const reels = [1, 2, 3, 4, 5];
  const result = [];

  // visual spin
  reels.forEach((i) => {
    const el = $(`reel-${i}`);
    if (el) el.classList.add("spinning");
  });

  for (let i = 0; i < reels.length; i++) {
    await new Promise((res) => setTimeout(res, 220 + i * 130));
    const symbol = randomSymbol();
    result[i] = symbol;
    setReelSymbol(reels[i], symbol);

    const el = $(`reel-${reels[i]}`);
    if (el) el.classList.remove("spinning");
  }

  // simple paytable
  let win = 0;
  const allSame = result.every((s) => s === result[0]);

  if (allSame && result[0] === "📖") {
    // full screen book
    win = bet * 12;
  } else if (allSame) {
    win = bet * 6;
  } else {
    // count books
    const books = result.filter((s) => s === "📖").length;
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

// ========== NAVIGATION ==========
async function goBack() {
  if (slotsBalance > 0) {
    await withdrawFromSlots(true);
  }
  window.location.href =
    `${window.location.origin}/webapp/games/slots.html?uid=${USER_ID}`;
}


// ========== INIT ==========
window.addEventListener("load", () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  if (!USER_ID) {
    setStatus("Չհաջողվեց ստանալ user id", "lose");
    return;
  }
  loadUser();
  updateBalances();
});
