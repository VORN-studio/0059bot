const tg = window.Telegram.WebApp;
const API = "https://domino-backend-iavj.onrender.com";  // քո backend URL

let USER_ID = null;
let CURRENT_BALANCE = 0;

let multiplier = 1.00;
let gameInterval = null;
let gameRunning = false;
let crashed = false;

// 🔹 Բացվելիս վերցնում ենք user ID Telegram-ից
tg.ready();
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    USER_ID = tg.initDataUnsafe.user.id;
}

// 🔹 Բեռնում ենք բալանսը backend-ից
async function loadBalance() {
    if (!USER_ID) return;

    const res = await fetch(`${API}/api/user/${USER_ID}`);
    const data = await res.json();

    if (data.ok) {
        CURRENT_BALANCE = data.user.balance_usd;
        document.getElementById("user-balance").textContent = CURRENT_BALANCE.toFixed(2);
    }
}

loadBalance();


// -------------------------
// 🔥 ՍԿՍԵԼ ԽԱՂԸ
// -------------------------
function startGame() {
    if (gameRunning) return;

    const betAmount = Number(document.getElementById("bet-amount").value);

    if (!betAmount || betAmount <= 0) {
        return showStatus("❌ Գրիր ճիշտ գումար");
    }

    if (betAmount > CURRENT_BALANCE) {
        return showStatus("❌ Բալանսը բավարար չէ");
    }

    crashed = false;
    gameRunning = true;

    document.getElementById("start-btn").style.display = "none";
    document.getElementById("claim-btn").style.display = "block";

    multiplier = 1.00;
    updateMultiplier();

    // 🔥 multiplier animation
    gameInterval = setInterval(() => {
        multiplier += 0.01 + Math.random() * 0.03;

        updateMultiplier();

        // random crash
        if (Math.random() < 0.015 * multiplier) {
            crashGame();
        }
    }, 90);

    showStatus("🎮 Խաղը սկսվեց");
}

function updateMultiplier() {
    document.getElementById("multiplier").textContent = multiplier.toFixed(2) + "x";
}


// -------------------------
// 💥 CRASH — վերջացավ
// -------------------------
function crashGame() {
    crashed = true;
    clearInterval(gameInterval);

    document.getElementById("claim-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";

    showStatus("💥 Crash! Դուք չեք հասցրել Claim անել");
}


// -------------------------
// 🟢 CLAIM (վերցնել շահումը)
// -------------------------
async function claimWin() {
    if (!gameRunning || crashed) return;

    clearInterval(gameInterval);

    const betAmount = Number(document.getElementById("bet-amount").value);
    const winAmount = betAmount * multiplier;

    // կոչ backend bet API
    const res = await fetch(`${API}/api/game/bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: USER_ID,
            amount: betAmount,
            game: "crash",
            choice: multiplier
        })
    });

    let text = "";
    const data = await res.json();

    if (data.ok) {
        CURRENT_BALANCE = data.new_balance;
        document.getElementById("user-balance").textContent = CURRENT_BALANCE.toFixed(2);

        text = "🟢 Հաջող Claim!\nՇահում՝ " + winAmount.toFixed(2) + " $";
    } else {
        text = "❌ Backend սխալ";
    }

    showStatus(text);

    document.getElementById("claim-btn").style.display = "none";
    document.getElementById("start-btn").style.display = "block";

    gameRunning = false;
}


// -------------------------
// 🔙 ՎԵՐԱԴԱՌՆԱԼ ԳԼԽԱՎՈՐ ՄԵՆՅՈՒ
// -------------------------
function goBack() {
    tg.close();
}


// -------------------------
function showStatus(msg) {
    document.getElementById("status").innerHTML = msg;
}
