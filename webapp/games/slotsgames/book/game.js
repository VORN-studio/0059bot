const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let mainBalance = 0;
let slotsBalance = 0;
let spinning = false;

/* ─────────── SLOT CONFIG ─────────── */
const ROWS = 3;
const COLS = 5;
const STRIP_LENGTH = 24;

/* ─────────── SYMBOL SYSTEM ─────────── */
const SYMBOLS = [
  "book1","book2","book3","book4","book5",
  "book6","book7","book8","book9","book10","book11"
];

const SYMBOL_IMAGES = {
  book1: "symbols/book1.png",
  book2: "symbols/book2.png",
  book3: "symbols/book3.png",
  book4: "symbols/book4.png",
  book5: "symbols/book5.png",
  book6: "symbols/book6.png",
  book7: "symbols/book7.png",
  book8: "symbols/book8.png",
  book9: "symbols/book9.png",
  book10: "symbols/book10.png",
  book11: "symbols/book11.png"
};

function randomSymbol() {
  const roll = Math.random();
  if (roll < 0.05) return "book1";
  if (roll < 0.15) return "book11";
  if (roll < 0.30) return "book10";
  if (roll < 0.50) return ["book7","book8","book9"][Math.floor(Math.random()*3)];
  return ["book2","book3","book4","book5","book6"][Math.floor(Math.random()*5)];
}

/* ─────────── STRIP ENGINE ─────────── */
function buildStrip() {
  const arr = [];
  for (let i = 0; i < STRIP_LENGTH; i++) arr.push(randomSymbol());
  return arr;
}

function renderStrip(col, stripArray) {
  const container = document.querySelector(`.reel[data-col="${col}"] .strip`);
  container.innerHTML = stripArray
    .map(s => `<img src="${SYMBOL_IMAGES[s]}">`)
    .join("");
}

function animateReel(col, stopSymbols, delay) {
  const strip = document.querySelector(`.reel[data-col="${col}"] .strip`);
  const stripData = buildStrip();

  stripData.push(stopSymbols[0], stopSymbols[1], stopSymbols[2]);
  renderStrip(col, stripData);

  const symbolHeight = 80;
  const totalHeight = stripData.length * symbolHeight;
  const visibleHeight = ROWS * symbolHeight;
  const offset = totalHeight - visibleHeight;

  setTimeout(() => {
    strip.style.transform = `translateY(-${offset}px)`;
  }, delay);
}

/* ─────────── SPIN ─────────── */
async function spin() {

    // RESET SPIN POSITION
    document.querySelectorAll(".strip").forEach(s => {
      s.style.transition = "none";       // անջատում ենք անիմացիան
      s.style.transform = "translateY(0)"; // վերադարձնում ենք վերև
      void s.offsetWidth;                 // forced reflow (reset animation)
      s.style.transition = "";            // նորից միացնում ենք անիմացիան
    });


  if (spinning) return;

  const bet = Number(document.getElementById("bet-input").value);
  if (!bet || bet <= 0) return setStatus("Գրիր ճիշտ գումար", "lose");
  if (bet > slotsBalance) return setStatus("Չունես այդքան բալանս", "lose");

  spinning = true;
  document.getElementById("spin-btn").disabled = true;
  setStatus("Պտտում ենք…");

  slotsBalance -= bet;
  updateBalances();

  const finalGrid = [];
  for (let r = 0; r < ROWS; r++) {
    finalGrid[r] = [];
    for (let c = 0; c < COLS; c++) {
      finalGrid[r][c] = randomSymbol();
    }
  }

  for (let col = 0; col < COLS; col++) {
    animateReel(col, [
      finalGrid[0][col],
      finalGrid[1][col],
      finalGrid[2][col]
    ], col * 200);
  }

  await new Promise(res => setTimeout(res, 200 * COLS + 900));

  const mid = finalGrid[1];
  let win = 0;

  if (mid.every(s => s === mid[0])) win = bet * 8;

  if (win > 0) {
    slotsBalance += win;
    updateBalances();
    setStatus(`🏆 Հաղթեցիր ${win}`, "win");
  } else {
    setStatus("😕 Այս անգամ ոչինչ չկար", "lose");
  }

  spinning = false;
  document.getElementById("spin-btn").disabled = false;
}

/* ─────────── HELPERS ─────────── */
function $(id) { return document.getElementById(id); }

function updateBalances() {
  $("main-balance").textContent = mainBalance.toFixed(2);
  $("slots-balance").textContent = slotsBalance.toFixed(2);
}

function setStatus(text, type="") {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + type;
}

function getUidFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid") || 0);
}

/* ─────────── BACKEND LOAD / BALANCE / MODALS ─────────── */
async function loadUser() {
  try {
    if (!USER_ID) return;
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    if (!js.ok) return;
    mainBalance = Number(js.user.balance_usd || 0);
    updateBalances();
  } catch {}
}

function openInfo(){ $("info-modal").classList.remove("hidden"); }
function closeInfo(){ $("info-modal").classList.add("hidden"); }

function openDepositModal(){
  $("slot-deposit-input").value="";
  $("slot-deposit-error").textContent="";
  $("slot-deposit-modal").classList.remove("hidden");
}
function closeDepositModal(){
  $("slot-deposit-modal").classList.add("hidden");
}

async function confirmDeposit() {
  const amount = Number($("slot-deposit-input").value);
  if (!amount || amount <= 0) return $("slot-deposit-error").textContent="Գրիր ճիշտ գումար";
  if (amount > mainBalance) return $("slot-deposit-error").textContent="Չունես այդքան գումար";

  closeDepositModal();
  const r = await fetch(`${API}/api/slots/deposit`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ user_id:USER_ID, amount })
  });
  const js = await r.json();
  if (!js.ok) return setStatus("❌ Backend սխալ (deposit)", "lose");
  mainBalance = Number(js.new_main||0);
  slotsBalance += amount;
  updateBalances();
  setStatus(`➕ ${amount} փոխանցվեց Slots`, "win");
}

async function withdrawFromSlots(silent=false) {
  if (slotsBalance <= 0) return !silent && setStatus("Slots բալանսը = 0");
  const amount = slotsBalance;

  const r = await fetch(`${API}/api/slots/withdraw`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ user_id:USER_ID, amount })
  });
  const js = await r.json();
  if (!js.ok) return !silent && setStatus("❌ Backend սխալ", "lose");

  mainBalance = Number(js.new_main||0);
  slotsBalance = 0;
  updateBalances();
  !silent && setStatus("⬅ Վերադարձավ հիմնական բալանս", "win");
}

/* ─────────── INIT ─────────── */
window.addEventListener("load", () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  if (!USER_ID) return setStatus("Ոչ մի user id", "lose");
  loadUser();
  updateBalances();
});
