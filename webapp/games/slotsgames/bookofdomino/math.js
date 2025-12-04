/* =====================================================
      BOOK OF DOMINO — MATH ENGINE
      Controls volatility, symbol weights, probabilities
   ===================================================== */

/* ============================================
      SYMBOL WEIGHT CONFIG
   ============================================ */
/*
  ככל փոքր թիվ → ավելի հազվադեպ սիմվոլ.
  ככל մեծ թիվ → ավելի հաճախակի սիմվոլ.
*/

export const symbolWeights = {
    "A":   22,
    "K":   20,
    "Q":   18,
    "J":   18,
    "10":  16,

    "🍒":  14,
    "⭐":  12,
    "🔔":  10,
    "💎":  8,
    "7️⃣": 6,

    "📘": 2   // Scatter — VERY RARE
};

/* =====================================================
      BONUS (SCATTER) PROBABILITY CONTROLLER
   ===================================================== */

export const bonusMath = {
    baseChance: 0.009,   // 0.9% chance spin–ում bonus drop
    forcedMode: false,   // Admin future: can force bonus
};

/* =====================================================
      RTP (RETURN TO PLAYER) CONTROL
   ===================================================== */

export const RTP = {
    target: 0.94,             // 94% theoretical return
    volatility: 1.35,         // 1.0 = smooth, 2.0 = explosive
    bonusImpact: 0.45         // Bonus արտահայտված մասնակցությունը ընդհանուր RTP–ում
};

/* =====================================================
      GET A RANDOM SYMBOL BASED ON WEIGHTS
   ===================================================== */

export function getWeightedSymbol() {
    const entries = Object.entries(symbolWeights);

    let totalWeight = 0;
    entries.forEach(([sym, weight]) => totalWeight += weight);

    let rnd = Math.random() * totalWeight;

    for (let [sym, weight] of entries) {
        if (rnd < weight) return sym;
        rnd -= weight;
    }

    return "A"; // fallback (չի լինի գործնականում)
}

/* =====================================================
      GENERATE A FULL COLUMN (3 symbols)
   ===================================================== */

export function generateColumn() {
    return [
        getWeightedSymbol(),
        getWeightedSymbol(),
        getWeightedSymbol(),
    ];
}

/* =====================================================
      BONUS DROP LOGIC (SCATTER CONTROL)
   ===================================================== */

export function shouldDropBonus() {
    if (bonusMath.forcedMode) return true;

    return Math.random() < bonusMath.baseChance;
}

/* =====================================================
      VOLATILITY-BASED WIN BOOST
   ===================================================== */
/*
  Երբ արդյունքում win > 0, այս ֆունկցիան win-ը բազմապատկում
  կամ նվազեցնում է ըստ volatility-ի:
*/

export function applyVolatility(baseWin) {
    if (baseWin <= 0) return 0;

    const vol = RTP.volatility;

    // High volatility → շատ ցատկեր
    const randomFactor = 1 + (Math.random() * (vol - 1));

    return baseWin * randomFactor;
}

/* =====================================================
      RTP SAFETY FILTER
   ===================================================== */
/*
  Հետագայում կարող ենք այստեղ ավելացնել ամբողջ RTP tracking:
  Այժմ — win-ը չի թողնում գնա չափազանց բարձր:
*/

export function clampWin(win, bet) {
    const maxMultiplier = 250 * RTP.volatility;  
    const maxAllowed = bet * maxMultiplier;

    if (win > maxAllowed) return maxAllowed;
    return win;
}

/* =====================================================
      GENERATE COMPLETE REELS (5×3)
      Uses weights + bonus drop math
   ===================================================== */

export function generateReels() {
    const reels = [];

    const bonusWillDrop = shouldDropBonus();
    let scatterPlaced = false;

    for (let col = 0; col < 5; col++) {
        let column = [];

        for (let row = 0; row < 3; row++) {

            // ensure bonus placement
            if (bonusWillDrop && !scatterPlaced && Math.random() < 0.15) {
                column.push("📘");
                scatterPlaced = true;
                continue;
            }

            column.push(getWeightedSymbol());
        }

        reels.push(column);
    }

    return reels;
}
