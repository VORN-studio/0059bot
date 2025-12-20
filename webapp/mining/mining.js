const tg = window.Telegram && window.Telegram.WebApp;
const API_BASE = window.location.origin;
const TIER_NAMES = {
    1: "Initiate",
    2: "Apprentice",
    3: "Associate",
    4: "Adept",
    5: "Knight",
    6: "Vanguard",
    7: "Ascendant",
    8: "Sovereign",
    9: "Imperial",
    10: "Ethereal",
};

let USER_ID = null;
let userBalance = 0;

// ---------------------------------------
// CUSTOM MODAL
// ---------------------------------------
function showModal(icon, title, message, type = "success") {
    const modalOverlay = document.getElementById("modal-overlay");
    const modalContent = document.querySelector(".modal-content");
    const modalIcon = document.getElementById("modal-icon");
    const modalTitle = document.getElementById("modal-title");
    const modalMessage = document.getElementById("modal-message");
    
    modalIcon.textContent = icon;
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    // Գույնը փոխում ենք type-ի համաձայն
    if (type === "error") {
        modalContent.style.background = "linear-gradient(135deg, #4a1a1a 0%, #2d0f0f 100%)";
        modalContent.style.borderColor = "rgba(239, 68, 68, 0.3)";
        modalContent.style.boxShadow = "0 0 60px rgba(239, 68, 68, 0.4), 0 20px 80px rgba(0, 0, 0, 0.9)";
    } else {
        modalContent.style.background = "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)";
        modalContent.style.borderColor = "rgba(56, 189, 248, 0.3)";
        modalContent.style.boxShadow = "0 0 60px rgba(56, 189, 248, 0.4), 0 20px 80px rgba(0, 0, 0, 0.9)";
    }
    
    modalOverlay.style.display = "flex";
    
    // 🔥 SCROLL անենք modal-ը viewport center-ին
    setTimeout(() => {
        const scrollY = window.scrollY || window.pageYOffset;
        const viewportHeight = window.innerHeight;
        const modalHeight = modalContent.offsetHeight;
        const centerPosition = scrollY + (viewportHeight / 2) - (modalHeight / 2);
        
        modalOverlay.scrollTop = centerPosition - scrollY;
    }, 50);
}

function closeModal() {
    document.getElementById("modal-overlay").style.display = "none";
}

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
    
    // ✅ Batch render - ավելի արագ է քան forEach appendChilds
    const fragment = document.createDocumentFragment();

    data.plans.forEach(plan => {
        const div = document.createElement("div");
        div.className = "plan-card";

        div.innerHTML = `
            <h3>${plan.name}</h3>
            <p>Գին: ${plan.price_usd} DOMIT</p>
            <p>Արտադրանք/ժամ: ${plan.domit_per_hour.toFixed(3)}</p>
            <button onclick="buyPlan(${plan.id})" class="btn">Գնել</button>
        `;

        fragment.appendChild(div);
    });
    
    // ✅ Մեկ անգամ append (ոչ թե N անգամ)
    box.innerHTML = "";
    box.appendChild(fragment);
}

// ---------------------------------------
// LOAD CURRENT MINING STATE
// ---------------------------------------
// ---------------------------------------
// LOAD CURRENT MINING STATE
// ---------------------------------------
// ---------------------------------------
// LOAD CURRENT MINING STATE
// ---------------------------------------
async function loadState() {
    const res = await fetch(`${API_BASE}/api/mining/state/${USER_ID}`);
    const data = await res.json();

    if (!data.ok) return;

    // Եթե ընդհանրապես փաթեթ չկա
    if (!data.miners || data.miners.length === 0) {
        document.getElementById("active-miner-box").style.display = "none";
        document.getElementById("header-speed").textContent = "0.000";
        return;
    }

    let totalSpeed   = 0; // բոլոր փաթեթների գումարով արտադրանք/ժամ
    let totalPending = 0; // բոլոր pending DOMIT-ի գումարը
    let maxTier      = 0; // ամենամեծ tier-ը

    data.miners.forEach(miner => {
        // pending_domit – նույնը թողնում ենք
        totalPending += Number(miner.pending_domit || 0);

        // ⚡ speed-ը հաշվում ենք reward_per_second_usd-ից
        // reward_per_second_usd → DOMIT/վայրկյան, ուրեմն *3600 → DOMIT/ժամ
        const rps = Number(miner.reward_per_second_usd || 0);
        const minerSpeed = rps * 3600;
        totalSpeed += minerSpeed;

        // Tier-ի համար վերցնենք ամենամեծը
        if (miner.tier && miner.tier > maxTier) {
            maxTier = miner.tier;
        }
    });

    // Ցույց ենք տալիս ակտիվ փաթեթների բլոկը
    document.getElementById("active-miner-box").style.display = "block";

    // Ամենաբարձր Tier
    // Քանի մայնինգ փաթեթ կա ընդհանուր
    const totalMiners = data.miners.length;

    // Tier դաշտում ցույց տանք և՛ ամենաբարձր tier-ը, և՛ փաթեթների քանակը
    // Ամենաբարձր tier-ի անունը
    const tierName = TIER_NAMES[maxTier] || `Tier ${maxTier}`;

    // Tier field → Elite name + count
    document.getElementById("active-tier").textContent =
    totalMiners > 1 ? `${tierName} (x${totalMiners})` : tierName;

    // Արտադրանք/ժամ — ԱՄԲՈՂՋ summa
    document.getElementById("active-speed").textContent = totalSpeed.toFixed(3);
    document.getElementById("header-speed").textContent = totalSpeed.toFixed(3);

    // Բոլոր փաթեթների կուտակված DOMIT
    document.getElementById("active-earned").textContent = totalPending.toFixed(3);

    // Բալանսը թողնում ենք userBalance-ից
    document.getElementById("header-balance").textContent = userBalance.toFixed(2);
    document.getElementById("user-balance").textContent   = userBalance.toFixed(2);
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
        showModal("❌", "Սխալ", data.error, "error");
        return;
    }

    showModal("✅", "Հաջողություն", "Փաթեթը ձեռք բերվեց");

    
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

    showModal("💰", "Հաջողություն", "DOMIT հատվածը տեղափոխվեց բալանս");

    userBalance = data.new_balance_usd;
    document.getElementById("user-balance").textContent = userBalance.toFixed(2);
    document.getElementById("header-balance").textContent = userBalance.toFixed(2);



    loadState();
});



// ---------------------------------------
initUser();
// ---------------------------------------

