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

// ==========================
// MINI SLOT PREVIEW ENGINE
// ==========================

// slot symbols
const previewSymbols = ["🍒", "⭐", "💎", "🔔", "7️⃣"];

// reel spin duration (C — slow version)
const SPIN_TIME = 1500; // 1.5 sec per reel
const DELAY_BETWEEN_REELS = 300; // 0.3 sec
const LOOP_DELAY = 1800; // wait before restarting sequence

// Fill reel with random symbols scrolling effect
function fillReelWithRandom(reel) {
    reel.innerHTML = "";
    for (let i = 0; i < 6; i++) {
        const d = document.createElement("div");
        d.textContent = previewSymbols[Math.floor(Math.random() * previewSymbols.length)];
        reel.appendChild(d);
    }
}

// Animate reel spin
function spinMiniReel(reel) {
    return new Promise((resolve) => {
        let start = Date.now();

        function animate() {
            reel.style.transform = "translateY(-60px)";

            setTimeout(() => {
                fillReelWithRandom(reel);
                reel.style.transform = "translateY(0px)";
            }, 120);

            if (Date.now() - start < SPIN_TIME) {
                requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }

        animate();
    });
}

// Stop on 7️⃣
function stopMiniReelOnSeven(reel) {
    reel.innerHTML = "";
    for (let i = 0; i < 6; i++) {
        const d = document.createElement("div");
        d.textContent = i === 5 ? "7️⃣" : previewSymbols[Math.floor(Math.random() * previewSymbols.length)];
        reel.appendChild(d);
    }
    reel.style.transform = "translateY(-300px)";

    setTimeout(() => {
        reel.style.transform = "translateY(0px)";
    }, 50);
}

// Main loop
async function miniSlotLoop() {
    const r1 = document.getElementById("mreel1");
    const r2 = document.getElementById("mreel2");
    const r3 = document.getElementById("mreel3");

    while (true) {
        // initial random fill
        fillReelWithRandom(r1);
        fillReelWithRandom(r2);
        fillReelWithRandom(r3);

        // REEL 1
        await spinMiniReel(r1);
        stopMiniReelOnSeven(r1);

        await new Promise(res => setTimeout(res, DELAY_BETWEEN_REELS));

        // REEL 2
        await spinMiniReel(r2);
        stopMiniReelOnSeven(r2);

        await new Promise(res => setTimeout(res, DELAY_BETWEEN_REELS));

        // REEL 3
        await spinMiniReel(r3);
        stopMiniReelOnSeven(r3);

        // pause before restart
        await new Promise(res => setTimeout(res, LOOP_DELAY));
    }
}

// Start animation automatically
setTimeout(() => {
    miniSlotLoop();
}, 600);
