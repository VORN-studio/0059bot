const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

// GAME CONFIG — ԱՅՍՏԵՂ ԵՍ ԿԱՌԱՎԱՐՈՒՄ ՀԱՎԱՆԱԿԱՆՈՒԹՅՈՒՆԸ
const DICE_CONFIG = {
  // որքան բարձր է թիվը, այնքան ՀԱՂԹՈՒՄ է բոտը
  // 0.7 նշանակում է ~70% ռաունդներում օգտատերը կպարտվի
  BOT_WIN_RATE: 0.9,

  // որքան է win-ի multiplier-ը (քանի անգամ է վերադառնում բեթը)
  PAYOUT_MULTIPLIER: 2.6
};

let USER_ID = null;
let mainBalance = 0;   // բազայից եկող հիմնական բալանս
let diceBalance = 0;   // միայն Dice խաղի ներսում

let roundRunning = false;
let allowPick = false;
let currentBet = 0;
let plannedResult = null; // "win" կամ "lose"
let hiddenCupIndex = 1; // որի տակ “պահվում է” զառը տվյալ ռաունդի համար

// ================= Helpers =================

function getUidFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid"));
}

function updateBalances() {
  document.getElementById("main-balance").textContent = mainBalance.toFixed(2);
  document.getElementById("dice-balance").textContent = diceBalance.toFixed(2);
}

function showStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.classList.remove("win", "lose");
  if (type) el.classList.add(type);
}

function buildCups() {
  const container = document.getElementById("cups");
  container.innerHTML = "";

  for (let i = 0; i < 3; i++) {
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";

    const cup = document.createElement("div");
    cup.className = "cup";
    cup.dataset.index = i;
    cup.addEventListener("click", () => onCupClick(i));

    const shadow = document.createElement("div");
    shadow.className = "cup-shadow";

    wrapper.appendChild(cup);
    wrapper.appendChild(shadow);
    container.appendChild(wrapper);
  }
}

function setCupsSelectable(flag) {
  const cups = document.querySelectorAll(".cup");
  cups.forEach((c) => {
    c.classList.remove("can-pick", "selected", "reveal", "shuffle");
    if (flag) c.classList.add("can-pick");
  });
}

function showDiceDrop(index) {
  const glow = document.getElementById("dice-glow");

  // reset classes
  glow.className = "dice-glow";
  glow.classList.add(`dice-pos-${index}`, "visible", "drop");

  // 0.7վրկ հետո բացում ենք shuffle-ը
  setTimeout(() => {
    glow.classList.remove("drop", "visible");
    showStatus("♻️ Перемешиваем стаканы...");
    startShuffleAnimation();
  }, 700);
}


function startShuffleAnimation() {
  const cups = document.querySelectorAll(".cup");
  cups.forEach((c, idx) => {
    c.classList.add("shuffle");
    c.style.animationDelay = `${idx * 90}ms`;
  });

  // մոտ 2 վրկ հետո թույլ կտանք ընտրել
  setTimeout(() => {
    const cups2 = document.querySelectorAll(".cup");
    cups2.forEach((c) => c.classList.remove("shuffle"));
    allowPick = true;
    setCupsSelectable(true);
    showStatus("Выбери стакан, под которым кубик 👀");
  }, 1900);
}

function revealDice(userIndex, didWin) {
  const glow = document.getElementById("dice-glow");
  glow.className = "dice-glow"; // reset classes
  glow.classList.remove("dice-pos-0", "dice-pos-1", "dice-pos-2", "visible");

  let diceIndex;

  if (didWin) {
    // հաղթելու դեպքում՝ իրականում զառը հենց օգտատիրոջ ընտրած բաժակի տակ է
    diceIndex = userIndex;
  } else {
    // պարտվելու դեպքում՝ ընտրում ենք ուրիշ բաժակ, բայց ոչ օգտատիրոջը
    const options = [0, 1, 2].filter((i) => i !== userIndex);
    diceIndex = options[Math.floor(Math.random() * options.length)];
  }

  hiddenCupIndex = diceIndex; // “իրական” դիրքը պահենք

  glow.classList.add(`dice-pos-${diceIndex}`, "visible");

  const cups = document.querySelectorAll(".cup");
  cups[userIndex].classList.add("selected", "reveal");
}

// ================= Load User =================

async function loadUser() {
  try {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    if (js.ok) {
      mainBalance = js.user.balance_usd;
      updateBalances();
    } else {
      showStatus("❌ Не удалось загрузить баланс");
    }
  } catch (e) {
    console.log("loadUser error", e);
    showStatus("❌ Ошибка сервера");
  }
}

// ================= Deposit / Withdraw =================

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
    document.getElementById("deposit-error").textContent =
      "Недостаточно средств։";
    return;
  }

  closeDepositModal();

  try {
    const r = await fetch(`${API}/api/dice/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, amount })
    });

    const js = await r.json();
    if (!js.ok) {
      return showStatus("❌ Backend error");
    }

    mainBalance = js.new_main;
    diceBalance += amount;

    updateBalances();
    showStatus(`➕ ${amount.toFixed(2)} DOMIT переведен на баланс Dice`);
  } catch (e) {
    console.log("deposit error", e);
    showStatus("❌ Ошибка сервера");
  }
}

async function withdrawFromDice() {
  if (diceBalance <= 0) {
    return showStatus("❌ Dice balance = 0");
  }

  const amount = diceBalance;

  try {
    const r = await fetch(`${API}/api/dice/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        amount: amount
      })
    });

    const js = await r.json();
    if (!js.ok) {
      return showStatus("❌ Backend error");
    }

    mainBalance += amount;
    diceBalance = 0;
    updateBalances();

    showStatus("⬅ Баланс Dice возвращен на основной баланс");
  } catch (e) {
    console.log("withdraw error", e);
    showStatus("❌ Ошибка сервера");
  }
}

// ================= GAME FLOW =================

function decideResult() {
  // random թիվ 0–1; եթե փոքր է BOT_WIN_RATE-ից → բոտը հաղթեց
  const r = Math.random();
  return r < DICE_CONFIG.BOT_WIN_RATE ? "lose" : "win";
}

function startRound() {
  if (roundRunning) return;

  const bet = Number(document.getElementById("bet").value);
  if (!bet || bet <= 0) {
    return showStatus("❌ Введите корректную сумму");
  }
  if (bet > diceBalance) {
    return showStatus("❌ Недостаточно средств на балансе Dice");
  }

  // հանում ենք բեթը Dice balance-ից հենց սկզբում
  currentBet = bet;
  diceBalance -= currentBet;
  if (diceBalance < 0) diceBalance = 0;
  updateBalances();

  roundRunning = true;
  allowPick = false;
  plannedResult = decideResult();

  // պատահական որոշում ենք՝ որ բաժակի տակ է զառը մտնում
  hiddenCupIndex = Math.floor(Math.random() * 3);

  setCupsSelectable(false);
  showStatus("🎲 Кубик заходит под стакан...");

  // նախ ցույց ենք տալիս զառի “ընկնելը”, հետո՝ shuffle
  showDiceDrop(hiddenCupIndex);
}

function cancelRound() {
  if (!roundRunning || allowPick) return; // եթե արդեն ընտրում է, չեղարկում չունի իմաստ
  // վերադարձնում ենք բեթը diceBalance-ին
  diceBalance += currentBet;
  currentBet = 0;
  roundRunning = false;
  setCupsSelectable(false);
  updateBalances();
  showStatus("Раунд отменен");
}

function onCupClick(index) {
  if (!roundRunning || !allowPick) return;

  allowPick = false;

  const didWin = plannedResult === "win";
  revealDice(index, didWin);

  if (didWin) {
    const winAmount = currentBet * DICE_CONFIG.PAYOUT_MULTIPLIER;
    diceBalance += winAmount;
    showStatus(
      `🟢 Вы выиграли! ${currentBet.toFixed(
        2
      )}DOMIT → ${winAmount.toFixed(2)}$`,
      "win"
    );
  } else {
    showStatus("💔 Ставка проиграна... в следующий раз повезет!", "lose");
  }

  updateBalances();
  currentBet = 0;
  roundRunning = false;
}

// ================= BACK =================

async function goBack() {
  // եթե Dice balance-ում փող կա՝ նախ վերադարձնենք հիմնական բալանսին
  if (diceBalance > 0) {
    await withdrawFromDice();
  }

  // հետո գնում ենք հիմնական app
  window.location.href = `${window.location.origin}/app?uid=${USER_ID}&t=${Date.now()}`;
}

// ================= INIT =================

window.onload = () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  buildCups();
  loadUser();
};
