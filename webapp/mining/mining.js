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

async function goBack(){
  window.location.href = `${window.location.origin}/app?uid=${USER_ID}`;
}




// ---------------------------------------
// LOAD USER
// ---------------------------------------
async function loadUser() {
    const res = await fetch(`${API_BASE}/api/user/${USER_ID}`);
    const data = await res.json();

    if (data.ok) {
        userBalance = data.user.balance_usd;

        // ❗ Այստեղ այլևս division, DOMIT calculation չկան
        document.getElementById("user-balance").textContent = userBalance.toFixed(2);
        document.getElementById("header-balance").textContent = userBalance.toFixed(2);
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
        document.getElementById("header-speed").textContent = "0.000";
        return;
    }

    // ---- Calculate total mining results from ALL plans ----
    let totalSpeed = 0;
    let totalPending = 0;
    let maxTier = 0;

    data.miners.forEach(miner => {
        totalSpeed += miner.speed || 0;
        totalPending += miner.pending_domit || 0;

        if (miner.tier > maxTier) maxTier = miner.tier;
    });

    // ---- Show active miner box ----
    document.getElementById("active-miner-box").style.display = "block";

    // Show highest tier (optional, beautiful for UI)
    document.getElementById("active-tier").textContent = maxTier;

    // Show combined mining output
    document.getElementById("active-speed").textContent = totalSpeed.toFixed(3);
    document.getElementById("active-earned").textContent = totalPending.toFixed(3);

    // header top info
    document.getElementById("header-speed").textContent = totalSpeed.toFixed(3);


    // Update DOMIT balance after state refresh
    document.getElementById("header-balance").textContent = userBalance.toFixed(2);
    document.getElementById("user-balance").textContent = userBalance.toFixed(2);

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
    document.getElementById("header-balance").textContent = userBalance.toFixed(2);



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
    document.getElementById("header-balance").textContent = userBalance.toFixed(2);



    loadState();
});

// ---------------------------------------
initUser();
// ---------------------------------------
