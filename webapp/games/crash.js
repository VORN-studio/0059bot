const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;

let mainBalance = 0;
let crashBalance = 0;

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

// Build domino chain
function buildDominoChain() {
    const chain = document.getElementById("domino-chain");
    chain.innerHTML = "";
    for (let i = 0; i < 12; i++) {
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
        }, i * 80);
    });
}

function crashEffect() {
    const pieces = document.querySelectorAll(".domino");
    const last = pieces[pieces.length - 1];
    last.classList.add("crashed");
}

// ================= Load User =================

async function loadUser() {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    if (js.ok) {
        mainBalance = js.user.balance_usd;
        updateBalances();
    }
}

// ================= Deposit / Withdraw =================

function depositToCrash() {
    const raw = prompt("Գումարը ($):");
    const amount = Number(raw);

    if (!amount || amount <= 0) return show("❌ Սխալ գումար");
    if (amount > mainBalance) return show("❌ Բավարար չէ");

    mainBalance -= amount;
    crashBalance += amount;

    updateBalances();
    show("➕ Տեղափոխված է Crash balance");
}

function withdrawFromCrash() {
    if (crashBalance <= 0) return show("❌ Crash balance = 0");

    mainBalance += crashBalance;
    crashBalance = 0;

    updateBalances();
    show("⬅ Հනված է հիմնական բալանսին");
}

// ================= GAME =================

function startCrash() {
    const bet = Number(document.getElementById("bet").value);

    if (!bet || bet <= 0) return show("❌ Սխալ գումար");
    if (bet > crashBalance) return show("❌ Crash balance-ը չի հերիքում");

    currentBet = bet;
    crashBalance -= bet;
    updateBalances();

    running = true;
    crashed = false;

    multiplier = 1;
    setMultiplier();
    buildDominoChain();
    fallEffect();

    document.getElementById("start-btn").style.display = "none";
    document.getElementById("cashout-btn").style.display = "block";

    timer = setInterval(() => {
        multiplier += 0.018 + Math.random() * 0.035;
        setMultiplier();

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

    crashEffect();

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

    const js = await r.json();
    if (!js.ok) return show("❌ Backend error");

    mainBalance = js.new_balance;
    crashBalance += win;

    updateBalances();
    show("🟢 +" + win.toFixed(2) + " $");

    document.getElementById("cashout-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";
}

// ================= BACK =================

function goBack() {
    window.location.href = `${window.location.origin}/app?uid=${USER_ID}`;
}

// ================= INIT =================

window.onload = () => {
    USER_ID = tg?.initDataUnsafe?.user?.id || getUid();
    loadUser();
    buildDominoChain();
};
