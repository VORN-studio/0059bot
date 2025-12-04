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

  if (name === "classic777") {
    $("slot-game").classList.add("active");
    $("slot-game-book").classList.remove("active");
  }

  if (name === "book") {
    $("slot-game").classList.remove("active");
    $("slot-game-book").classList.add("active");
  }
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

    if (!js.ok) return showGameStatus("❌ Backend error");

    mainBalance = js.new_main;
    slotsBalance += amount;

    updateBalances();
    showGameStatus(`➕ ${amount}$ փոխանցվեց Slots balance`);

  } catch (e) {
    showGameStatus("❌ Սերվերի սխալ");
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

function spinReel(reelId, finalSymbol) {
  return new Promise((resolve) => {
    const reel = $(reelId);

    // safe start
    reel.classList.add("spinning");

    let ticks = 0;
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

// ============ BOOK OF DOMINO ENGINE ============

const bookSymbols = ["A", "K", "Q", "J", "10", "📖"]; // 📖 Book = scatter/wild
const BOOK_WIN_RATE = 0.55;

function getBookSymbol() {
  return bookSymbols[Math.floor(Math.random() * bookSymbols.length)];
}

function bookDetermineResult() {
  return Math.random() > BOOK_WIN_RATE;
}

function spinBookReel(id, finalSym) {
  return new Promise((resolve) => {
    const reel = $(id);
    reel.classList.add("spinning");

    let ticks = 0;
    let maxTicks = 20 + Math.floor(Math.random() * 10);

    const timer = setInterval(() => {
      reel.textContent = getBookSymbol();
      ticks++;

      if (ticks >= maxTicks) {
        clearInterval(timer);

        setTimeout(() => {
          reel.classList.remove("spinning");
          reel.textContent = finalSym;
          resolve();
        }, 150);
      }
    }, 80);
  });
}


async function spinBook() {
  if (spinning) return;
  spinning = true;
  $("book-status").textContent = "";

  const bet = Number($("book-bet").value);

  if (!bet || bet <= 0) {
    spinning = false;
    return $("book-status").textContent = "❌ Գրել ճիշտ գումար";
  }

  if (bet > slotsBalance) {
    spinning = false;
    return $("book-status").textContent = "❌ Slots balance չի հերիքում";
  }

  slotsBalance -= bet;
  updateBalances();

  const win = bookDetermineResult();

  // Generate results
  let final = [];
  for (let i = 0; i < 5; i++) final.push(getBookSymbol());

  if (win) {
    // force 3 scatters
    final = ["📖", "📖", "📖", getBookSymbol(), getBookSymbol()];
  }

  // Spin all 5 reels
  await spinBookReel("b1", final[0]);
  await spinBookReel("b2", final[1]);
  await spinBookReel("b3", final[2]);
  await spinBookReel("b4", final[3]);
  await spinBookReel("b5", final[4]);

  if (win) {
    const reward = bet * 4.2;
    slotsBalance += reward;
    updateBalances();
    $("book-status").textContent = `🟢 Հաղթեցիր ${reward.toFixed(2)}$`;
  } else {
    $("book-status").textContent = "💔 Պարտվեցիր";
  }

  spinning = false;
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

  // 🟣 FIRST: generate result symbols
  let resultSymbols;
  if (userWins) {
    resultSymbols = ["7️⃣", "7️⃣", "7️⃣"];
  } else {
    resultSymbols = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
  }

  // 🟦 SECOND: spin reels with correct final symbol
  await spinReel("r1", resultSymbols[0]);
  await spinReel("r2", resultSymbols[1]);
  await spinReel("r3", resultSymbols[2]);

  // 🟢 THIRD: apply win/lose reward
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
