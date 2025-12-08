const tg = window.Telegram && window.Telegram.WebApp;
const API_BASE = "https://domino-backend-iavj.onrender.com";

let USER_ID = null;
let userBalance = 0;

// ---------------------------------------
// INIT from Telegram
// ---------------------------------------
function initUser() {
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        alert("⚠️ Բացիր բոտից, ոչ թե browser-ից");
        return;
    }

    USER_ID = tg.initDataUnsafe.user.id;
    loadUser();
    loadPlans();
    loadState();
}

// ---------------------------------------
// LOAD USER
// ---------------------------------------
async function loadUser() {
    const res = await fetch(`${API_BASE}/api/user/${USER_ID}`);
    const data = await res.json();

    if (data.ok) {
        userBalance = data.user.balance_usd;
        document.getElementById("user-balance").textContent = userBalance.toFixed(2);
    }
}

// ---------------------------------------
// LOAD MINING PLANS
// ---------------------------------------
async function loadPlans() {
    const res = await fetch(`${API_BASE}/api/mining/plans`);
    const data = await res.json();

    if (!data.ok) return;

    const box = document.getElementById("plans-box");
    box.innerHTML = "";

    data.plans.forEach(plan => {
        const div = document.createElement("div");
        div.className = "plan-card";

        div.innerHTML = `
            <h3>${plan.name}</h3>
            <p>Գին: ${plan.price_usd} DOMIT</p>
            <p>Արտադրանք/ժամ: ${plan.domit_per_hour.toFixed(3)}</p>
            <button onclick="buyPlan(${plan.id})" class="btn">Գնել</button>
        `;

        box.appendChild(div);
    });
}

// ---------------------------------------
// LOAD CURRENT MINING STATE
// ---------------------------------------
async function loadState() {
    const res = await fetch(`${API_BASE}/api/mining/state/${USER_ID}`);
    const data = await res.json();

    if (!data.ok) return;

    if (data.miners.length === 0) {
        document.getElementById("active-miner-box").style.display = "none";
        return;
    }

    const m = data.miners[0];
    document.getElementById("active-miner-box").style.display = "block";
    document.getElementById("active-tier").textContent = m.tier;
    document.getElementById("active-speed").textContent = m.pending_domit.toFixed(3);
    document.getElementById("active-earned").textContent = m.pending_domit.toFixed(3);
}

// ---------------------------------------
// BUY MINING PLAN
// ---------------------------------------
async function buyPlan(id) {
    if (!USER_ID) return;

    const res = await fetch(`${API_BASE}/api/mining/buy`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ user_id: USER_ID, plan_id: id })
    });

    const data = await res.json();

    if (!data.ok) {
        tg.showPopup({ message: "❌ " + data.error });
        return;
    }

    tg.showPopup({ message: "✅ Փաթեթը ձեռք բերվեց" });

    userBalance = data.user.balance_usd;
    document.getElementById("user-balance").textContent = userBalance.toFixed(2);

    loadState();
}

// ---------------------------------------
// CLAIM REWARD
// ---------------------------------------
document.getElementById("claim-btn").addEventListener("click", async () => {
    const res = await fetch(`${API_BASE}/api/mining/claim`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ user_id: USER_ID })
    });

    const data = await res.json();

    if (!data.ok) {
        tg.showPopup({ message: "❌ " + data.error });
        return;
    }

    tg.showPopup({ message: "💰 DOMIT հատվածը տեղափոխվեց բալանս" });

    userBalance = data.new_balance_usd;
    document.getElementById("user-balance").textContent = userBalance.toFixed(2);

    loadState();
});

// ---------------------------------------
initUser();
// ---------------------------------------
