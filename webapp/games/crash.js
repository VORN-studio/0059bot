const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;

let mainBalance = 0;     // բազայից եկող ընդհանուր բալանս
let crashBalance = 0;    // միայն Crash խաղի ներսում

let multiplier = 1.0;
let running = false;
let crashed = false;
let timer = null;
let currentBet = 0;

// ================= Helpers =================

function getUid() {
    const p = new URLSearchParams(window.location.search);
    return Number(p.get("uid"));
}

function updateBalances() {
    document.getElementById("main-balance").textContent = mainBalance.toFixed(2);
    document.getElementById("crash-balance").textContent = crashBalance.toFixed(2);
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

// ---- Domino chain build / animation ----

function buildDominoChain() {
    const chain = document.getElementById("domino-chain");
    chain.innerHTML = "";
    // շղթայի երկարությունը
    for (let i = 0; i < 14; i++) {
        const d = document.createElement("div");
        d.className = "domino";
        chain.appendChild(d);
    }
}

function fallEffect() {
    const pieces = document.querySelectorAll(".domino");
    pieces.forEach((p, i) => {
        setTimeout(() => {
            p.classList.add("fall");
        }, i * 80);   // domino effect, մեկը մյուսի հետևից
    });
}

function crashEffect() {
    const pieces = document.querySelectorAll(".domino");
    if (!pieces.length) return;
    const last = pieces[pieces.length - 1];
    last.classList.add("crashed");
}

// ================= Load User from backend =================

async function loadUser() {
    try {
        const r = await fetch(`${API}/api/user/${USER_ID}`);
        const js = await r.json();
        if (js.ok) {
            mainBalance = js.user.balance_usd;
            updateBalances();
        } else {
            show("❌ Չհաջողվեց բեռնել բալանսը");
        }
    } catch (e) {
        console.log("loadUser error", e);
        show("❌ Սերվերի սխալ");
    }
}

// ================= Deposit / Withdraw =================

function depositToCrash() {
    if (mainBalance <= 0) {
        return show("❌ Նախ լիցքավորիր հիմնական բալանսը Deposit բաժնից");
    }

    const raw = prompt("Գումարը ($), որը ուզում ես խաղալ Crash-ում:");
    const amount = Number(raw);

    if (!amount || amount <= 0) return show("❌ Սխալ գումար");
    if (amount > mainBalance) return show("❌ Այդքան գումար չունես հիմնական բալանսում");

    crashBalance += amount;
    updateBalances();
    show("➕ " + amount.toFixed(2) + " $ տեղափոխվեց Crash balance");
    return;


    updateBalances();
    show("➕ " + amount.toFixed(2) + " $ տեղափոխվեց Crash balance");
}

function withdrawFromCrash() {
    if (crashBalance <= 0) return show("❌ Crash balance = 0");

    mainBalance += crashBalance;
    crashBalance = 0;

    updateBalances();
    show("⬅ Crash balance-ը վերադարձվեց հիմնական բալանսին");
}

// ================= GAME =================

function startCrash() {
    const bet = Number(document.getElementById("bet").value);

    if (!bet || bet <= 0) return show("❌ Գումարը գրիր ճիշտ");
    if (bet > crashBalance) return show("❌ Crash balance-ը չի հերիքում");

    if (running) return;

    currentBet = bet;

    // հանենք բեթը Crash balance-ից հենց սկզբում
    crashBalance -= currentBet;
    if (crashBalance < 0) crashBalance = 0;
    updateBalances();

    running = true;
    crashed = false;

    multiplier = 1.0;
    setMultiplier();

    // նոր կառուցենք շղթան ու թողնենք ընկնի հերթով
    buildDominoChain();
    fallEffect();

    document.getElementById("start-btn").style.display = "none";
    document.getElementById("cashout-btn").style.display = "block";

    show("🎮 Խաղը սկսվեց");

    timer = setInterval(() => {
        multiplier += 0.018 + Math.random() * 0.035;
        setMultiplier();

        // crash հավանականություն — մեծանալու հետ ռիսկն էլ է աճում
        if (Math.random() < 0.014 * multiplier) {
            crashNow();
        }
    }, 90);
}

function crashNow() {
    if (!running) return;

    running = false;
    crashed = true;
    clearInterval(timer);

    crashEffect();  // վերջին դոմինոն կողքի

    document.getElementById("cashout-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";

    show("💥 Crash! Չհասցրեցիր Claim անել");
}



// ================= CLAIM =================

async function cashOut() {
    if (!running || crashed) return;

    clearInterval(timer);
    running = false;

    const win = currentBet * multiplier;

    show("💸 Հաշվում ենք…");

    let js;
    try {
        const r = await fetch(`${API}/api/game/bet`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({
                user_id: USER_ID,
                amount: currentBet,
                game: "crash",
                choice: multiplier
            })
        });
        js = await r.json();
    } catch (e) {
        console.log("bet error", e);
        return show("❌ Սերվերի սխալ");
    }

    if (!js.ok) {
        return show("❌ Backend error");
    }

    // ❗ Backend-ը main balance-ը այս պահին չպետք է փոփոխի crash-ի համար
    // շահումը գնում է միայն Crash balance-ի վրա
    crashBalance += win;
    updateBalances();

    show("🟢 +" + win.toFixed(2) + " $");

    document.getElementById("cashout-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";
}

// ================= BACK =================

function goBack() {
    // Force reload so that main menu fetches REAL balance from DB
    window.location.href = `${window.location.origin}/app?uid=${USER_ID}&t=${Date.now()}`;
}


// ================= INIT =================

window.onload = () => {
    USER_ID = tg?.initDataUnsafe?.user?.id || getUid();
    loadUser();
    buildDominoChain();
};
