const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let mainBalance = 0;
let slotsBalance = 0;

// HELPERS
function $(id) { return document.getElementById(id); }

function updateBalances() {
  $("main-balance").textContent = mainBalance.toFixed(2);
  $("slots-balance").textContent = slotsBalance.toFixed(2);
}

function showStatus(msg) { $("status").textContent = msg; }

// INIT
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
  } catch (e) { console.log("load error", e); }
}

window.onload = () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  loadUser();
};

// OPEN SLOT GAME (REDIRECT TO NEW FOLDER)
function openSlot(gameName) {
  window.location.href =
    `${window.location.origin}/webapp/games/slotsgames/${gameName}/index.html?uid=${USER_ID}`;
}

// DEPOSIT MODAL
function openDepositModal() {
  $("slot-deposit-input").value = "";
  $("slot-deposit-error").textContent = "";
  $("slot-deposit-modal").classList.remove("hidden");
}
function closeDepositModal() {
  $("slot-deposit-modal").classList.add("hidden");
}

// CONFIRM DEPOSIT
async function confirmDeposit() {
  const amount = Number($("slot-deposit-input").value);

  if (!amount || amount <= 0)
    return $("slot-deposit-error").textContent = "Գրիր ճիշտ գումար";

  if (amount > mainBalance)
    return $("slot-deposit-error").textContent = "Չունես այդքան գումար";

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

// WITHDRAW ALL SLOT BALANCE
async function withdrawFromSlots() {
  if (slotsBalance <= 0) return showStatus("Slots balance = 0");

  const amount = slotsBalance;

  try {
    const r = await fetch(`${API}/api/slots/withdraw`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
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

// BACK TO MAIN APP
async function goBack() {
  if (slotsBalance > 0) await withdrawFromSlots();
  window.location.href = `${window.location.origin}/app?uid=${USER_ID}`;
}

const miniSymbols = ["🍒","⭐","🔔","💎","7️⃣"];

function spinMiniReel(reelId, delay) {
    const reel = document.getElementById(reelId);
    let index = 0;

    let spin = setInterval(() => {
        reel.textContent = miniSymbols[index % miniSymbols.length];
        index++;
    }, 80);

    setTimeout(() => {
        clearInterval(spin);

        // final result
        reel.textContent = "7️⃣";
    }, delay);
}

function startMiniSlotSpin() {
    spinMiniReel("miniR1", 600);
    spinMiniReel("miniR2", 1000);
    spinMiniReel("miniR3", 1400);
}

setInterval(startMiniSlotSpin, 2500);
