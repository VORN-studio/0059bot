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
let STOP_FALL = false;
let fallenCount = 0; 
let totalDominos = 0;

// ================= CONFIG =================

const CRASH_CONFIG = {
    GROWTH_MIN: 0.040,   // ամեն քայլի +1.5% նվազագույն
    GROWTH_MAX: 0.050,   // ամեն քայլի +3.0% առավելագույն

    // House edge — որքանով է խաղը կոշտ
    // 0.10 = մեղմ, 0.30 = սովորական, 0.50+ = շատ կոշտ
    HOUSE_EDGE: 0.40,

    // Մաքսիմալ multiplier, որից բարձր երբեք չի գնա
    MAX_MULTIPLIER: 10.0,

    // Ինստանտ (շատ փոքր) crash-ի հավանականություն
    // օրինակ 0.15 = 15% պահը երբ խաղը կպայթի 1.00–1.05x վրա
    INSTANT_CRASH_CHANCE: 0.25
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
    totalDominos = 0;
    fallenCount = 0;
    // Սկզբում դատարկ է - domino-ները կստեղծվեն multiplier-ի աճի հետ
}

function addDomino() {
    const chain = document.getElementById("domino-chain");
    const d = document.createElement("div");
    d.className = "domino";
    chain.appendChild(d);
    totalDominos++;
}

// function fallEffect() {
    //const pieces = document.querySelectorAll(".domino");
    //pieces.forEach((p, i) => {
        //setTimeout(() => {
            //if (!STOP_FALL) {  
                //p.classList.add("fall");
            //}
        //}, i * 120);
    //});

//}

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
            show("❌ Не удалось загрузить баланс");
        }
    } catch (e) {
        console.log("loadUser error", e);
        show("❌ Ошибка сервера");
    }
}

// ================= Deposit / Withdraw =================

function depositToCrash() {
    openDepositModal();
}


function openDepositModal() {
    document.getElementById("deposit-input").value = "";
    document.getElementById("deposit-error").textContent = "";
    document.getElementById("deposit-modal").classList.remove("hidden");
}

function closeDepositModal() {
    document.getElementById("deposit-modal").classList.add("hidden");
}

async function confirmDeposit() {
    const amount = Number(document.getElementById("deposit-input").value);

    if (!amount || amount <= 0) {
        document.getElementById("deposit-error").textContent = "Введите корректную сумму";
        return;
    }

    if (amount > mainBalance) {
        document.getElementById("deposit-error").textContent = "Недостаточно средств.";
        return;
    }

    closeDepositModal();

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
    show("➕ " + amount.toFixed(2) + " DOMIT переведен на баланс Crash.");
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

        show("⬅ Баланс Crash возвращен на основной баланс.");
    } catch (e) {
        console.log("withdraw error", e);
        show("❌ Ошибка сервера");
    }
}


// ================= GAME =================

function startCrash() {
    STOP_FALL = false;
    fallenCount = 0;
    totalDominos = 0;

    const bet = Number(document.getElementById("bet").value);

    if (!bet || bet <= 0) return show("❌ Введите верную сумму");
    if (bet > crashBalance) return show("❌ Недостаточный баланс Crash.");
    if (running) return;

    currentBet = bet;

    crashBalance -= currentBet;
    if (crashBalance < 0) crashBalance = 0;
    updateBalances();

    running = true;
    crashed = false;

    multiplier = 1.0;
    setMultiplier();

    crashPoint = generateCrashPoint();
    console.log("🎯 Crash point:", crashPoint, "x");

    // Մաքուր շղթա
    buildDominoChain();
    
    // Reset scroll position
    const chain = document.getElementById("domino-chain");
    chain.style.transform = "translateX(0)";

    document.getElementById("start-btn").style.display = "none";
    document.getElementById("cashout-btn").style.display = "block";

    show("🎮 Игра началась");

    // Multiplier-ի աճը
    timer = setInterval(() => {
        const step =
            CRASH_CONFIG.GROWTH_MIN +
            Math.random() * (CRASH_CONFIG.GROWTH_MAX - CRASH_CONFIG.GROWTH_MIN);

        multiplier += step;
        setMultiplier();

        // Ամեն 0.12x-ի համար 1 domino ստեղծվում և ընկնում է
        const shouldExist = Math.floor((multiplier - 1.0) / 0.12) + 1;
        
        // Ստեղծենք նոր domino-ներ եթե պետք է
        while (totalDominos < shouldExist) {
            addDomino();
        }
        
        // Ընկցնենք domino-ները
        const pieces = document.querySelectorAll(".domino");
        while (fallenCount < shouldExist - 1 && fallenCount < pieces.length) {
            pieces[fallenCount].classList.add("fall");
            fallenCount++;
            
            // Scroll էֆեկտ - էկրանը շարժվում է ձախ
            const scrollOffset = fallenCount * 26; // 18px width + 8px gap
            chain.style.transform = `translateX(-${scrollOffset}px)`;
        }

        // Crash point
        if (multiplier >= crashPoint) {
            crashNow();
        }

    }, 90);
}


function crashNow() {
    if (!running) return;

    running = false;
    crashed = true;
    STOP_FALL = true;
    clearInterval(timer);

    // Crash-ի domino-ն = վերջին ընկած domino-ն
    const pieces = document.querySelectorAll(".domino");
    if (pieces[fallenCount]) {
        pieces[fallenCount].classList.add("crashed");
    }

    document.getElementById("cashout-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";

    show("💥 Crash! Не успел забрать.");
}






// ================= CLAIM =================

async function cashOut() {
    if (!running || crashed) return;

    clearInterval(timer);
    running = false;
    STOP_FALL = true;

    const win = currentBet * multiplier;

    crashBalance += win;
    updateBalances();

    show("🟢 +" + win.toFixed(2) + " DOMIT");

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
