const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

// ============== USER DATA ==============
let USER_ID = null;

let mainBalance = 0;   // backend-ից
let crashBalance = 0;  // խաղային բալանս (client-side)

let multiplier = 1.0;
let running = false;
let crashed = false;
let timer = null;
let currentBet = 0;


// ============== HELPERS ==============

function getUidFromUrl() {
    const p = new URLSearchParams(window.location.search);
    return Number(p.get("uid"));
}

function updateBalances() {
    document.getElementById("main-balance").textContent = mainBalance.toFixed(2);
    document.getElementById("crash-balance").textContent = crashBalance.toFixed(2);
}

function setDomino(state) {
    const d = document.getElementById("domino");

    d.classList.remove("fly", "fall");

    if (state === "fly") d.classList.add("fly");
    if (state === "fall") d.classList.add("fall");
}

function show(msg) {
    document.getElementById("status").innerHTML = msg;
}

function setMultiplier() {
    const el = document.getElementById("multiplier");
    el.textContent = multiplier.toFixed(2) + "x";
    el.style.transform = "scale(1.08)";
    setTimeout(() => el.style.transform = "scale(1)", 90);
}


// ============== LOAD USER ==============

async function loadUser() {
    const res = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await res.json();

    if (js.ok) {
        mainBalance = js.user.balance_usd;
        updateBalances();
    }
}


// ============== DEPOSIT TO CRASH ==============

function depositToCrash() {
    if (mainBalance <= 0) {
        return show("❌ Նախ լիցքավորիր հիմնական բալանսը Deposit բաժնից");
    }

    const raw = prompt("Գումարը ($) որը ուզում ես խաղալ Crash-ում:");
    const amount = Number(raw);

    if (!amount || amount <= 0) return show("❌ Սխալ գումար");
    if (amount > mainBalance) return show("❌ Նույնքան գումար չունես հիմնական բալանսում");

    // update local balances
    mainBalance -= amount;
    crashBalance += amount;

    updateBalances();
    show("➕ " + amount.toFixed(2) + " $ տեղափոխվեց Crash balance");
}


// ============== WITHDRAW FROM CRASH ==============

function withdrawFromCrash() {
    if (crashBalance <= 0) return show("❌ Crash balance = 0");

    mainBalance += crashBalance;
    crashBalance = 0;

    updateBalances();
    show("⬅ Crash funds returned to main balance");
}


// ============== START GAME ==============

function startCrash() {
    const bet = Number(document.getElementById("bet").value);

    if (!bet || bet <= 0) return show("❌ Գրիր ճիշտ գումար");
    if (bet > crashBalance) return show("❌ Crash balance-ը չի հերիքում");

    running = true;
    crashed = false;
    currentBet = bet;

    multiplier = 1;
    setMultiplier();
    setDomino("fly");

    // հանենք բեթը crashBalance–ից հենց հիմա
    crashBalance -= currentBet;
    if (crashBalance < 0) crashBalance = 0;
    updateBalances();


    document.getElementById("start-btn").style.display = "none";
    document.getElementById("cashout-btn").style.display = "block";

    show("🎮 Խաղը սկսվեց");

    timer = setInterval(() => {
      multiplier += 0.018 + Math.random() * 0.04;
      setMultiplier();

      updateDominoFall();  // ← ԱՅՍՏԵՂ Է ՀԵՐԹՈՎ ԸՆԿՆՈՒՄ ԴՈՄԻՆՈՆԵՐԸ

      if (Math.random() < 0.013 * multiplier) {
        crashNow();
      }
    }, 90);

}

function buildDominoChain(count = 20) {
    const chain = document.getElementById("domino-chain");
    chain.innerHTML = "";

    for (let i = 0; i < count; i++) {
        const tile = document.createElement("div");
        tile.className = "domino-tile";
        tile.dataset.index = i;
        chain.appendChild(tile);
    }
}

let dominoIndex = 0;

function updateDominoFall() {
    const tiles = document.querySelectorAll(".domino-tile");

    if (dominoIndex < tiles.length) {
        tiles[dominoIndex].classList.add("fall");
        dominoIndex++;
    }
}


// ============== CRASH ==============

function crashNow() {
    if (!running) return;

    running = false;
    crashed = true;
    clearInterval(timer);

    // Last domino falls sideways
    const tiles = document.querySelectorAll(".domino-tile");
    if (dominoIndex < tiles.length) {
        tiles[dominoIndex].classList.add("crashed");
    }

    show("💥 Crash!");
    document.getElementById("cashout-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";
}



// ============== CLAIM WIN ==============

async function cashOut() {
    if (!running || crashed) return;

    clearInterval(timer);
    running = false;

    const win = currentBet * multiplier;

    show("💸 Հաշվում ենք…");

    const res = await fetch(`${API}/api/game/bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: USER_ID,
            amount: currentBet,
            game: "crash",
            choice: multiplier
        })
    });

    const js = await res.json();

    if (js.ok) {
        mainBalance = js.new_balance;     // backend actual balance
        crashBalance += win;
        updateBalances();
        show("🟢 +" + win.toFixed(2) + " $");
    } else {
        show("❌ Backend error");
    }

    setDomino(null);

    document.getElementById("cashout-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";
}


// ============== GO BACK ==============

function goBack() {
    window.location.href = `${window.location.origin}/app?uid=${USER_ID}`;
}


// ============== INIT ==============

window.onload = () => {

    if (tg && tg.initDataUnsafe?.user) {
        USER_ID = tg.initDataUnsafe.user.id;
    } else {
        USER_ID = getUidFromUrl();
    }
    buildDominoChain();
    loadUser();
};
