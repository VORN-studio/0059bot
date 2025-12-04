/* ============================================
   BOOK OF DOMINO — BONUS GAME ENGINE
   ============================================ */

/*
BONUS MECHANICS:
----------------
• 3+ Scatter (📘) → activates bonus
• Award: 10 Free Spins
• Before bonus starts → choose random EXPANDING SYMBOL
• Each spin:
    - reels spin normally
    - if enough expanding symbols appear (3 on line) → full expand & pay
*/

export const BONUS = {
    active: false,
    spinsLeft: 0,
    expanding: null,
    totalWin: 0,
};

/* Symbols used in bonus */
export const SYM = ["A", "K", "Q", "J", "10", "💎", "🔔", "⭐", "🍒", "7️⃣"];

/* Paytable for expanding symbols (per SYMBOL × bet) */
export const EXPAND_PAY = {
    "A":   8,
    "K":   7,
    "Q":   6,
    "J":   5,
    "10":  4,
    "💎": 20,
    "🔔": 12,
    "⭐":  10,
    "🍒":  6,
    "7️⃣": 25
};


/* ================================
   START BONUS (Triggered by scatters)
   ================================ */
export function startBonus() {
    BONUS.active = true;
    BONUS.spinsLeft = 10;
    BONUS.totalWin = 0;

    BONUS.expanding = SYM[Math.floor(Math.random() * SYM.length)];

    showBonusStartModal(BONUS.expanding);
}


/* ================================
   PROCESS 1 FREE SPIN
   (Called by main spin engine)
   ================================ */
export function processBonusSpin(reels, bet) {

    if (!BONUS.active) return 0;

    let count = 0;

    for (let col = 0; col < reels.length; col++) {
        for (let row = 0; row < reels[col].length; row++) {
            if (reels[col][row] === BONUS.expanding) count++;
        }
    }

    let reward = 0;

    if (count >= 3) {
        reward = bet * EXPAND_PAY[BONUS.expanding];
        BONUS.totalWin += reward;
    }

    BONUS.spinsLeft--;
    if (BONUS.spinsLeft <= 0) endBonus();

    return reward;
}


/* ================================
   END BONUS
   ================================ */
export function endBonus() {
    BONUS.active = false;

    showBonusEndModal(BONUS.totalWin);
}


/* ================================
   UI HELPERS
   ================================ */

function showBonusStartModal(symbol) {
    const modal = document.getElementById("bonus-start-modal");
    document.getElementById("bonus-symbol").textContent = symbol;
    modal.classList.remove("hidden");
}

function showBonusEndModal(total) {
    const modal = document.getElementById("bonus-end-modal");
    document.getElementById("bonus-total").textContent = total.toFixed(2);
    modal.classList.remove("hidden");
}
