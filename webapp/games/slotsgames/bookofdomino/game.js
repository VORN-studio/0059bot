/* =====================================================
      BOOK OF DOMINO — MAIN GAME ENGINE (5×3 SLOT)
   ===================================================== */

import { BONUS, startBonus, processBonusSpin } from "./bonus.js";

/* ---------- SYMBOL SET ---------- */
export const SYM = [
    "A", "K", "Q", "J", "10",
    "💎", "🔔", "⭐", "🍒", "7️⃣",
    "📘"  // Scatter
];

/* ---------- PAYTABLE (line wins) ---------- */
/* Պարզ օրինակներ. Հետագայում կարող ենք մեծացնել */
export const PAY = {
    "A":   {3: 5, 4: 20, 5: 60},
    "K":   {3: 5, 4: 18, 5: 55},
    "Q":   {3: 4, 4: 14, 5: 40},
    "J":   {3: 4, 4: 12, 5: 35},
    "10":  {3: 3, 4: 10, 5: 30},

    "💎":  {3: 10, 4: 40, 5: 120},
    "🔔":  {3: 8,  4: 30, 5: 90},
    "⭐":  {3: 7,  4: 25, 5: 70},
    "🍒":  {3: 5,  4: 20, 5: 50},
    "7️⃣": {3: 12, 4: 50, 5: 150},
};

/* =====================================================
      GENERATE SPIN (random reels)
   ===================================================== */

export function generateSpin() {
    let reels = [];

    for (let col = 0; col < 5; col++) {
        let column = [];
        for (let row = 0; row < 3; row++) {
            const s = SYM[Math.floor(Math.random() * SYM.length)];
            column.push(s);
        }
        reels.push(column);
    }

    return reels;
}

/* =====================================================
      COUNT SCATTERS
   ===================================================== */

function countScatters(reels) {
    let count = 0;
    reels.forEach(col => {
        col.forEach(sym => {
            if (sym === "📘") count++;
        });
    });
    return count;
}

/* =====================================================
      EVALUATE LINE WINS
   ===================================================== */

/*
  Line system (classic 10-line slot style)
  10 գիծ — կարող ենք ավելացնել կամ փոխել՝ ցանկության դեպքում
*/

const LINES = [
    [1,1,1,1,1], // 1 straight middle
    [0,0,0,0,0], // 2 top line
    [2,2,2,2,2], // 3 bottom line

    [0,1,2,1,0], // 4 V shape
    [2,1,0,1,2], // 5 inverted V

    [0,1,1,1,0], // 6 slight V
    [2,1,1,1,2], // 7 slight ^
    [1,0,1,2,1], // 8 zigzag
    [1,2,1,0,1], // 9 zigzag reverse

    [0,1,2,2,2]  // 10 diagonal alt
];

export function evaluateLines(reels, bet) {
    let totalWin = 0;

    LINES.forEach(line => {
        let first = reels[0][line[0]];
        if (first === "📘") return; // Scatter does not create line wins

        let matchCount = 1;

        for (let i = 1; i < 5; i++) {
            const sym = reels[i][line[i]];
            if (sym === first) matchCount++;
            else break;
        }

        if (PAY[first] && PAY[first][matchCount]) {
            totalWin += bet * PAY[first][matchCount];
        }
    });

    return totalWin;
}

/* =====================================================
      MAIN SPIN FUNCTION
   ===================================================== */

export function spinGame(bet) {
    let reels = generateSpin();
    let scatterCount = countScatters(reels);

    let win = 0;

    /* Case 1 — BONUS active */
    if (BONUS.active) {
        win += processBonusSpin(reels, bet);
        return { reels, win, scatterCount, bonus: true };
    }

    /* Case 2 — normal spin */
    win = evaluateLines(reels, bet);

    /* Scatter → bonus trigger */
    if (scatterCount >= 3) startBonus();

    return {
        reels,
        win,
        scatterCount,
        bonus: false
    };
}
