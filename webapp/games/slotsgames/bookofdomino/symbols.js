/* =====================================================
      BOOK OF DOMINO — SYMBOL DEFINITIONS
      Symbols, payouts, types, classification
   ===================================================== */

export const SYMBOLS = [
    "A",
    "K",
    "Q",
    "J",
    "10",
    "🍒",
    "⭐",
    "🔔",
    "💎",
    "7️⃣",
    "📘"   // Scatter (Book symbol)
];

/* =====================================================
      SYMBOL TYPES
   ===================================================== */

export const SYMBOL_TYPE = {
    NORMAL: "normal",
    SCATTER: "scatter",
};

/* =====================================================
      SYMBOL META INFORMATION
   ===================================================== */

export const SYMBOL_INFO = {
    "A":   { type: SYMBOL_TYPE.NORMAL, name: "Ace" },
    "K":   { type: SYMBOL_TYPE.NORMAL, name: "King" },
    "Q":   { type: SYMBOL_TYPE.NORMAL, name: "Queen" },
    "J":   { type: SYMBOL_TYPE.NORMAL, name: "Jack" },
    "10":  { type: SYMBOL_TYPE.NORMAL, name: "Ten" },

    "🍒": { type: SYMBOL_TYPE.NORMAL, name: "Cherry" },
    "⭐": { type: SYMBOL_TYPE.NORMAL, name: "Star" },
    "🔔": { type: SYMBOL_TYPE.NORMAL, name: "Bell" },

    "💎": { type: SYMBOL_TYPE.NORMAL, name: "Diamond" },
    "7️⃣": { type: SYMBOL_TYPE.NORMAL, name: "Seven" },

    // BOOK SCATTER
    "📘": { type: SYMBOL_TYPE.SCATTER, name: "Book of Domino" },
};

/* =====================================================
      PAYTABLE (LINE WINS)
      All payouts are multipliers of bet per line
   ===================================================== */

export const PAYTABLE = {
    // Classic symbols
    "A":   { 3: 5,   4: 15,  5: 50  },
    "K":   { 3: 4,   4: 12,  5: 40  },
    "Q":   { 3: 3,   4: 10,  5: 35  },
    "J":   { 3: 2,   4: 8,   5: 30  },
    "10":  { 3: 2,   4: 6,   5: 25  },

    // Medium symbols
    "🍒": { 3: 8,   4: 20,  5: 60  },
    "⭐": { 3: 10,  4: 30,  5: 80  },
    "🔔": { 3: 12,  4: 40,  5: 100 },

    // Premium symbols
    "💎": { 3: 20,  4: 60,  5: 150 },
    "7️⃣": { 3: 30,  4: 100, 5: 250 },

    // Scatter Pays (bonus trigger)
    "📘": { 3: 2, 4: 20, 5: 200 }  // Scatter win is paid total bet multiplier
};

/* =====================================================
      PAYLINES — Classic 10-line Book slot layout
   ===================================================== */

export const PAYLINES = [
    [1,1,1,1,1], // line 1 — straight middle
    [0,0,0,0,0], // line 2 — top
    [2,2,2,2,2], // line 3 — bottom

    [0,1,2,1,0], // line 4 — V
    [2,1,0,1,2], // line 5 — mirrored V

    [0,1,1,1,0], // line 6
    [2,1,1,1,2], // line 7

    [1,0,0,0,1], // line 8
    [1,2,2,2,1], // line 9

    [0,1,2,2,2]  // line 10
];

/* =====================================================
      EXPORT DEFAULT FOR EASY IMPORT
   ===================================================== */

export default {
    SYMBOLS,
    SYMBOL_TYPE,
    SYMBOL_INFO,
    PAYTABLE,
    PAYLINES
};
