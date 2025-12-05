const tg = window.Telegram?.WebApp;
const API = window.location.origin;

let USER_ID = tg?.initDataUnsafe?.user?.id ||
             new URLSearchParams(window.location.search).get("uid");

// --- OUR BALANCE API LAYER ---
window.getBalance = async function () {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    return js.user.balance_usd;
};

window.updateBalance = async function (delta) {
    await fetch(`${API}/api/slots/update`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ user_id: USER_ID, delta })
    });
};

// --- SPIN RESULT HOOK ---
window.onSpinFinished = async function(win) {
    if(win > 0){
        await window.updateBalance(win);
    }
};

// --- EXIT HOOK ---
window.onExit = function(){
    window.location.href =
      `${window.location.origin}/webapp/slots.html?uid=${USER_ID}`;
};
