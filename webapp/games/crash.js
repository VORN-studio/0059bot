const tg = window.Telegram.WebApp;
const API = "https://domino-backend-iavj.onrender.com";

let USER_ID = null;
let BALANCE = 0;
let multiplier = 1.00;

let running = false;
let crashed = false;
let loop = null;

tg.ready();
if (tg.initDataUnsafe?.user) {
    USER_ID = tg.initDataUnsafe.user.id;
}

// ---------------------- LOAD BALANCE ----------------------
async function loadBalance() {
    if (!USER_ID) return;

    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();

    if (js.ok) {
        BALANCE = js.user.balance_usd;
        document.getElementById("balance").textContent = BALANCE.toFixed(2);
    }
}
loadBalance();

// ---------------------- START GAME ----------------------
function startCrash() {
    if (running) return;

    const bet = Number(document.getElementById("bet").value);
    if (!bet || bet <= 0) return show("❌ Գումարը սխալ է");
    if (bet > BALANCE) return show("❌ Բալանսը բավարար չէ");

    running = true;
    crashed = false;
    multiplier = 1.00;

    document.getElementById("start").style.display = "none";
    document.getElementById("cashout").style.display = "block";
    show("🎮 Խաղը սկսվեց");

    loop = setInterval(() => {
        multiplier += 0.015 + Math.random()*0.04;
        updateMultiplier();

        if (Math.random() < 0.012 * multiplier) {
            crash();
        }
    }, 90);
}

function updateMultiplier() {
    const el = document.getElementById("multiplier");
    el.textContent = multiplier.toFixed(2) + "x";
    el.style.transform = "scale(1.06)";
    setTimeout(()=> el.style.transform="scale(1)", 100);
}

// ---------------------- CRASH EVENT ----------------------
function crash() {
    crashed = true;
    running = false;
    clearInterval(loop);

    document.getElementById("cashout").style.display = "none";
    document.getElementById("start").style.display = "block";

    show("💥 Crash! Դուք չհասցրեցիք Claim անել");
}

// ---------------------- CLAIM ----------------------
async function cashOut() {
    if (!running || crashed) return;

    clearInterval(loop);
    running = false;

    const bet = Number(document.getElementById("bet").value);
    const win = bet * multiplier;

    show("💸 Հաշվում ենք…");

    const res = await fetch(`${API}/api/game/bet`, {
        method:"POST",
        headers:{ "Content-Type": "application/json" },
        body:JSON.stringify({
            user_id: USER_ID,
            amount: bet,
            game: "crash",
            choice: multiplier
        })
    });

    const js = await res.json();

    if (js.ok) {
        BALANCE = js.new_balance;
        document.getElementById("balance").textContent = BALANCE.toFixed(2);
        show("🟢 Հաջող Claim! +" + win.toFixed(2) + " $");
    } else {
        show("❌ Backend error");
    }

    document.getElementById("cashout").style.display = "none";
    document.getElementById("start").style.display = "block";
}

// ---------------------- BACK ----------------------
function goBack() {
    tg.close();
}

// ----------------------
function show(msg) {
    document.getElementById("status").innerHTML = msg;
}
