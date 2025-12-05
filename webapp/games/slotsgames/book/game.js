const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let mainBalance = 0;
let slotsBalance = 0;
let spinning = false;


const ROWS = 3;
const COLS = 5;
const STRIP_LENGTH = 24; // 20-30 լավ է իրական slot-ի զգացողության համար

// ստեղծում է սիմվոլների strip (երկար ցուցակ)
function buildStrip() {
  const arr = [];
  for (let i = 0; i < STRIP_LENGTH; i++) {
    arr.push(randomSymbol());
  }
  return arr;
}

// նկարում strip HTML-ը
function renderStrip(col, stripArray) {
  const container = document.querySelector(`.reel[data-col="${col}"] .strip`);
  container.innerHTML = stripArray
    .map(sym => `<img src="${SYMBOL_IMAGES[sym]}">`)
    .join("");
}

// scroll անիմացիա
function animateReel(col, stopRowSymbols, delay) {
  const strip = document.querySelector(`.reel[data-col="${col}"] .strip`);

  // random strip
  const stripData = buildStrip();

  // վերջում ավելացնում ենք 3 իրական հաղթող row-ի symbol–ները
  stripData.push(stopRowSymbols[0]);
  stripData.push(stopRowSymbols[1]);
  stripData.push(stopRowSymbols[2]);

  renderStrip(col, stripData);

  // మొత్తం strip-ի բարձրությունը
  const symbolHeight = 80; // img + margins
  const totalHeight = symbolHeight * stripData.length;

  // վերջի 3 row-ը middle window–ում դնելու համար հաշվարկում ենք offset
  const visibleHeight = symbolHeight * ROWS;
  const targetOffset = totalHeight - visibleHeight;

  setTimeout(() => {
    strip.style.transform = `translateY(-${targetOffset}px)`;
  }, delay);
}

// full spin
async function spin() {
  if (spinning) return;

  const bet = Number($("bet-input").value);
  if (!bet || bet <= 0) return setStatus("Գրիր ճիշտ գումար", "lose");
  if (bet > slotsBalance) return setStatus("Չունես այդքան բալանս", "lose");

  spinning = true;
  $("spin-btn").disabled = true;
  setStatus("Պտտում ենք…");

  slotsBalance -= bet;
  updateBalances();

  // >>> ստեղծում ենք 5×3 վերջնական grid
  const finalGrid = [];
  for (let row = 0; row < ROWS; row++) {
    finalGrid[row] = [];
    for (let col = 0; col < COLS; col++) {
      finalGrid[row][col] = randomSymbol();
    }
  }

  // >>> աշխատեցնում ենք 5 ռեելները հերթով scroll անիմացիայով
  for (let col = 0; col < COLS; col++) {
    const stopSymbols = [
      finalGrid[0][col],
      finalGrid[1][col],
      finalGrid[2][col]
    ];

    animateReel(col, stopSymbols, col * 180); // sequential stopping
  }

  // animation wait + payout
  await new Promise(r => setTimeout(r, 180 * COLS + 900));

  // midfield calculation (այժմ՝ միայն 1 գիծ)
  const mid = finalGrid[1];
  let win = 0;

  const same = mid.every(s => s === mid[0]);

  if (same) win = bet * 8;  // placeholder logic

  if (win > 0) {
    slotsBalance += win;
    updateBalances();
    setStatus(`🏆 Հաղթեցիր ${win}`, "win");
  } else {
    setStatus("😕 Այս անգամ ոչինչ չկար", "lose");
  }

  spinning = false;
  $("spin-btn").disabled = false;
}


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



// SYMBOL LIST
const SYMBOLS = [
  "book1", // scatter / wild
  "book2",
  "book3",
  "book4",
  "book5",
  "book6",
  "book7",
  "book8",
  "book9",
  "book10",
  "book11"
];

// Image mapping
const SYMBOL_IMAGES = {
  "book1": "symbols/book1.png",
  "book2": "symbols/book2.png",
  "book3": "symbols/book3.png",
  "book4": "symbols/book4.png",
  "book5": "symbols/book5.png",
  "book6": "symbols/book6.png",
  "book7": "symbols/book7.png",
  "book8": "symbols/book8.png",
  "book9": "symbols/book9.png",
  "book10": "symbols/book10.png",
  "book11": "symbols/book11.png"
};

const PAY_TABLE = {
  "book1": {3: 20, 4: 50, 5: 200},   // Scatter / special
  "book11": {3: 12, 4: 30, 5: 120},  // High
  "book10": {3: 10, 4: 25, 5: 100},  // High
  "book7": {3: 6, 4: 12, 5: 40},     // Mid
  "book8": {3: 6, 4: 12, 5: 40},     // Mid
  "book9": {3: 6, 4: 12, 5: 40},     // Mid
  "book2": {3: 4, 4: 8, 5: 20},      // Low
  "book3": {3: 4, 4: 8, 5: 20},
  "book4": {3: 4, 4: 8, 5: 20},
  "book5": {3: 4, 4: 8, 5: 20},
  "book6": {3: 4, 4: 8, 5: 20}
};

function renderSymbol(reelId, symbolName) {
  const el = document.getElementById(reelId);
  el.innerHTML = `<img src="${SYMBOL_IMAGES[symbolName]}" class="symbol-img">`;
}


function randomSymbol() {
  const roll = Math.random();

  if (roll < 0.05) return "book1";     // Scatter 5%
  if (roll < 0.15) return "book11";    // High symbol
  if (roll < 0.30) return "book10";    // High symbol
  if (roll < 0.50) return ["book7","book8","book9"][Math.floor(Math.random()*3)];
  return ["book2","book3","book4","book5","book6"][Math.floor(Math.random()*5)];
}



// լցնում ենք դաշտը random սիմվոլներով և նկարում DOM-ի վրա
function fillGrid() {
  const grid = [];

  for (let row = 0; row < ROWS; row++) {
    grid[row] = [];

    for (let col = 0; col < COLS; col++) {

      const sym = randomSymbol();
      grid[row][col] = sym;

      const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
      if (!cell) continue;

      cell.innerHTML = `<img src="${SYMBOL_IMAGES[sym]}" class="symbol-img">`;

      cell.classList.remove("stop");
      setTimeout(() => cell.classList.add("stop"), 20);
    }
  }

  return grid;
}

function animateCellDrop(row, col, symbolName, delay) {
  const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;

  const img = `<img src="${SYMBOL_IMAGES[symbolName]}" class="symbol-img">`;

  cell.classList.add("fall");       // սկսում ենք վերևից թռնել

  setTimeout(() => {
    cell.innerHTML = img;           // դնում ենք իրական սիմվոլը
    cell.classList.remove("fall");
    cell.classList.add("land");     // landing effect
    setTimeout(() => cell.classList.remove("land"), 180);
  }, delay);
}


function startSpinAnimation() {
  document.querySelectorAll(".book-reel").forEach((el, i) => {
    setTimeout(() => el.classList.add("spinning"), i * 70);
  });
}

function drawGridAnimated(grid) {
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {

      const symbol = grid[row][col];
      const delay = col * 160 + row * 60; // ⬅️ Reel stagger + row fall offset

      animateCellDrop(row, col, symbol, delay);
    }
  }
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
  drawGridAnimated(grid);


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
