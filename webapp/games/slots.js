const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let mainBalance = 0;
let slotsBalance = 0;

// helpers
function $(id){ return document.getElementById(id); }

function updateBalances(){
  $("main-balance").textContent = mainBalance.toFixed(2);
  $("slots-balance").textContent = slotsBalance.toFixed(2);
}

function showStatus(msg){ $("status").textContent = msg; }

// UID detection
function getUidFromUrl(){
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid"));
}

async function loadUser(){
  try {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    if(!js.ok) return;
    mainBalance = js.user.balance_usd;
    updateBalances();
  } catch(e){ console.log("load error", e); }
}

window.onload = () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  loadUser();
  loadSlots();
};

// CLEAN openSlot()
function openSlot(folderName){
  window.location.href =
    `${window.location.origin}/webapp/games/slots-engine/${folderName}/index.html?uid=${USER_ID}`;
}

// BACK BUTTON
async function goBack(){
  if(slotsBalance > 0) await withdrawFromSlots();
  window.location.href = `${window.location.origin}/app?uid=${USER_ID}`;
}

// DEPOSIT
function openDepositModal(){
  $("slot-deposit-input").value = "";
  $("slot-deposit-error").textContent = "";
  $("slot-deposit-modal").classList.remove("hidden");
}
function closeDepositModal(){
  $("slot-deposit-modal").classList.add("hidden");
}

async function confirmDeposit(){
  const amount = Number($("slot-deposit-input").value);

  if(!amount || amount <= 0)
    return $("slot-deposit-error").textContent = "Գրիր ճիշտ գումար";

  if(amount > mainBalance)
    return $("slot-deposit-error").textContent = "Չունես այդքան գումար";

  closeDepositModal();

  try {
    const r = await fetch(`${API}/api/slots/deposit`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ user_id: USER_ID, amount })
    });

    const js = await r.json();
    if(!js.ok) return showStatus("❌ Backend error");

    mainBalance = js.new_main;
    slotsBalance += amount;
    updateBalances();
    showStatus(`➕ ${amount}$ փոխանցվեց Slots balance`);

  } catch(err){
    showStatus("❌ Սերվերի սխալ");
  }
}

// WITHDRAW
async function withdrawFromSlots(){
  if(slotsBalance <= 0) return showStatus("Slots balance = 0");

  const amount = slotsBalance;

  try {
    const r = await fetch(`${API}/api/slots/withdraw`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ user_id: USER_ID, amount })
    });
    const js = await r.json();
    if(!js.ok) return showStatus("Backend error");

    mainBalance += amount;
    slotsBalance = 0;
    updateBalances();
    showStatus("⬅ Գումարը վերադարձվեց հիմնական բալանս");

  } catch(e){
    showStatus("❌ Սերվերի սխալ");
  }
}


// ===============================
// CLEAN SLOT LIST (ADD GAMES HERE)
// ===============================

const SLOT_LIST = [
  {
    name: "Domino Slots v1",
    folder: "domino_v1",
    img: "/webapp/games/slots-engine/domino_v1/preview.png"
  }
];


function loadSlots(){
  const container = $("slots-container");
  container.innerHTML = "";

  SLOT_LIST.forEach(slot => {
    const card = document.createElement("div");
    card.className = "slot-card";
    card.onclick = ()=> openSlot(slot.folder);

    card.innerHTML = `
      <img src="${slot.img}" class="slot-img">
      <div class="slot-name">${slot.name}</div>
    `;

    container.appendChild(card);
  });
}
