console.log("✅ Casino WebApp loaded");

const tg = window.Telegram?.WebApp;

// ------------ INIT TELEGRAM INFO ------------
if (tg) {
  tg.expand(); // լրիվ էկրանով բացվի
  const user = tg.initDataUnsafe?.user;
  if (user) {
    document.getElementById("user-id").textContent = user.id;
    document.getElementById("user-name").textContent =
      user.first_name + (user.username ? " (@" + user.username + ")" : "");
  }
}

// 💰 մինջև backend ունենալը, բալանսը կպահենք memory-ում
let fakeBalance = 10.0; // սկսենք 10$ բալանսից, հետո API-ով կբերենք Neon-ից

function updateBalanceDisplay() {
  const el = document.getElementById("user-balance");
  if (el) el.textContent = fakeBalance.toFixed(2) + " $";
}
updateBalanceDisplay();

// ------------ NAVIGATION BETWEEN SCREENS ------------
const buttons = document.querySelectorAll(".btn[data-section]");
const screens = document.querySelectorAll(".screen");

function showScreen(name) {
  screens.forEach((s) => s.classList.remove("active"));
  const screen = document.getElementById("screen-" + name);
  if (screen) screen.classList.add("active");
}

buttons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const section = btn.getAttribute("data-section");
    showScreen(section);
  });
});

// Wallet save (առայժմ լոկալ)
const walletInput = document.getElementById("wallet-input");
const walletStatus = document.getElementById("wallet-status");
const walletSaveBtn = document.getElementById("wallet-save-btn");

if (walletSaveBtn) {
  walletSaveBtn.addEventListener("click", () => {
    const value = walletInput.value.trim();
    if (!value) {
      walletStatus.textContent = "Խնդրում ենք գրել wallet հասցեն։";
      return;
    }
    // Այստեղ հետո կուղարկենք API-ին → Render + Neon
    walletStatus.textContent = "Wallet-ը պահպանված է (локալ v1). Բոնուսը կտանք backend-ում։";
  });
}

// Deposit fake
const depositInput = document.getElementById("deposit-amount");
const depositStatus = document.getElementById("deposit-status");
const depositBtn = document.getElementById("deposit-btn");

if (depositBtn) {
  depositBtn.addEventListener("click", () => {
    const amount = Number(depositInput.value);
    if (!amount || amount <= 0) {
      depositStatus.textContent = "Գրիր ճիշտ գումար։";
      return;
    }
    depositStatus.textContent =
      `Deposit հարցումը գրանցված է (ֆեյք v1: +${amount}$ բալանսին):`;
    fakeBalance += amount;
    updateBalanceDisplay();
  });
}

// Withdraw fake
const withdrawInput = document.getElementById("withdraw-amount");
const withdrawStatus = document.getElementById("withdraw-status");
const withdrawBtn = document.getElementById("withdraw-btn");

if (withdrawBtn) {
  withdrawBtn.addEventListener("click", () => {
    const amount = Number(withdrawInput.value);
    if (!amount || amount <= 0) {
      withdrawStatus.textContent = "Գրիր կանխիկացման գումարը։";
      return;
    }
    withdrawStatus.textContent =
      "v1 ռեժիմում սա դեռ ֆեյք է։ Իրական պայմաններն ու Neon/Postgres ստուգումը հետո կկապենք Render-ում։";
  });
}

// Referral link (լոկալ գեներացիա)
const refLinkInput = document.getElementById("ref-link");
const refCopyBtn = document.getElementById("ref-copy-btn");

if (refLinkInput) {
  const userId = tg?.initDataUnsafe?.user?.id;
  if (userId) {
    // քո բոտի անունը դնելու ես այստեղ
    const botUsername = "YourCasinoBot"; // ← փոխիր քո բոտի username-ով
    const link = `https://t.me/${botUsername}?start=ref_${userId}`;
    refLinkInput.value = link;
  } else {
    refLinkInput.value = "user id չկա (Telegram WebApp-ից դուրս ես փորձարկում)";
  }
}

if (refCopyBtn) {
  refCopyBtn.addEventListener("click", () => {
    refLinkInput.select();
    document.execCommand("copy");
    if (tg) tg.showPopup({ message: "Հղումը կոպի է արված ✅" });
  });
}
