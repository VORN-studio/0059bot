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

// ================= CONFIG =================

// Այս թվերով ես կառավարում խաղի բարդությունը
const CRASH_CONFIG = {
    // multiplier-ի աճի արագություն (որքան արագ է բարձրանում x-ը)
    GROWTH_MIN: 0.050,   // ամեն քայլի +1.5% նվազագույն
    GROWTH_MAX: 0.085,   // ամեն քայլի +3.0% առավելագույն

    // House edge — որքանով է խաղը կոշտ
    // 0.10 = մեղմ, 0.30 = սովորական, 0.50+ = շատ կոշտ
    HOUSE_EDGE: 0.70,

    // Մաքսիմալ multiplier, որից բարձր երբեք չի գնա
    MAX_MULTIPLIER: 10.0,

    // Ինստանտ (շատ փոքր) crash-ի հավանականություն
    // օրինակ 0.15 = 15% պահը երբ խաղը կպայթի 1.00–1.05x վրա
    INSTANT_CRASH_CHANCE: 0.30
};

// crash point, որտեղ պիտի պայթի
let crashPoint = null;


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

function generateCrashPoint() {
    // 1) Մասամբ շատ արագ պարտություններ (ինստանտ crash)
    if (Math.random() < CRASH_CONFIG.INSTANT_CRASH_CHANCE) {
        // 1.00x – 1.10x միջակայք
        const instant = 1.0 + Math.random() * 0.10;
        return parseFloat(instant.toFixed(2));
    }

    // 2) Հիմնական crash point — հնչեղ բաշխում, բայց կտրած
    // base = 1 / (1 - r) տալիս է ծանր պոչով բաշխում (շատ հազվադեպ բարձր x)
    const r = Math.random();
    let base = 1 / (1 - r);  // 1.0 ... ∞

    // House edge-ի կիրառություն — որքան մեծ է HOUSE_EDGE-ը,
    // այնքան փոքր է իրական crash point-ը
    base = base / (1 + CRASH_CONFIG.HOUSE_EDGE * 3);

    // Max cap
    if (base > CRASH_CONFIG.MAX_MULTIPLIER) {
        base = CRASH_CONFIG.MAX_MULTIPLIER;
    }

    // 1.01x-ից փոքր չլինի
    if (base < 1.01) base = 1.01;

    return parseFloat(base.toFixed(2));
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

async function depositToCrash() {
    const raw = prompt("Գումարը ($), որը ուզում ես խաղալ Crash-ում:");
    const amount = Number(raw);

    if (!amount || amount <= 0) return show("❌ Սխալ գումար");
    if (amount > mainBalance) return show("❌ Այդքան գումար չունես հիմնական բալանսում");

    // BACKEND-ին ասում ենք՝ հանի հիմնական բալանսից
    let r = await fetch(`${API}/api/crash/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: USER_ID, amount })
    });

    let js = await r.json();
    if (!js.ok) {
        return show("❌ Backend error");
    }

    mainBalance = js.new_main;
    crashBalance += amount;

    updateBalances();
    show("➕ " + amount.toFixed(2) + " $ տեղափոխվեց Crash balance");
}


async function withdrawFromCrash() {
    if (crashBalance <= 0) {
        return show("❌ Crash balance = 0");
    }

    const amount = crashBalance;

    try {
        const r = await fetch(`${API}/api/crash/withdraw`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: USER_ID,
                amount: amount
            })
        });

        const js = await r.json();
        if (!js.ok) {
            return show("❌ Backend error");
        }

        // frontend state update
        mainBalance += amount;
        crashBalance = 0;
        updateBalances();

        show("⬅ Crash balance-ը վերադարձվեց հիմնական բալանսին");
    } catch (e) {
        console.log("withdraw error", e);
        show("❌ Սերվերի սխալ");
    }
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

    // 🆕 Գեներացնում ենք crash point-ը հենց խաղի սկզբում
    crashPoint = generateCrashPoint();
    console.log("🎯 Crash point:", crashPoint, "x");

    // նոր կառուցենք շղթան ու թողնենք ընկնի հերթով
    buildDominoChain();
    fallEffect();

    document.getElementById("start-btn").style.display = "none";
    document.getElementById("cashout-btn").style.display = "block";

    show("🎮 Խաղը սկսվեց");

    // 🆕 multiplier-ի աճը հիմա կախված է CONFIG-ից
    timer = setInterval(() => {
        const step =
            CRASH_CONFIG.GROWTH_MIN +
            Math.random() * (CRASH_CONFIG.GROWTH_MAX - CRASH_CONFIG.GROWTH_MIN);

        multiplier += step;
        setMultiplier();

        // Եթե հասել ենք կամ անցել crashPoint → պայթում է
        if (multiplier >= crashPoint) {
            crashNow();
        }

    }, 90);
}


function crashNow() {
    if (!running) return;

    running = false;
    crashed = true;
    clearInterval(timer);

    // ❌ Այստեղ այլևս ոչ մի fetch /api/crash/lose չկա
    // պարտվելիս փողը արդեն հանված է crashBalance-ից startCrash-ում

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

    // win-ը պահում ենք միայն Crash balance-ում
    crashBalance += win;
    updateBalances();

    show("🟢 +" + win.toFixed(2) + " $");

    document.getElementById("cashout-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";
}



// ================= BACK =================

async function goBack() {
    // Եթե Crash balance-ում փող կա՝ նախ վերադարձնենք հիմնական բալանսին
    if (crashBalance > 0) {
        await withdrawFromCrash();   // backend + frontend update
    }

    // հետո գնում ենք հիմնական app
    window.location.href = `${window.location.origin}/app?uid=${USER_ID}&t=${Date.now()}`;
}



// ================= INIT =================

window.onload = () => {
    USER_ID = tg?.initDataUnsafe?.user?.id || getUid();
    loadUser();
    buildDominoChain();
};
