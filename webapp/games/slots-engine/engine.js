// ===============================
// Domino Slots Engine v1
// Միացվող ուղեղ բոլոր slots-ների համար
// ===============================

window.DominoEngine = (function () {
  const ENGINE = {};

  // ---- DEFAULT CONFIG ----
  ENGINE.config = {
    reels: 5,
    rows: 3,
    lines: 20,

    // symbol config
    symbols: [],       // կգա game-ից
    wild: "WILD",
    scatter: "SCATTER",

    // win control
    baseWinChance: 0.35,    // հիմնադիր հաղթելու հավանականություն (0–1)
    scatterChance: 0.04,    // 4% шанс scatter trigger-ի
    maxDailyPayout: 1000,   // օրական ընդհանուր win limit (քո գումարի միավորը)
    bigWinMultiplier: 30,   // Bet × 30-ից սկսած = Big Win

    // paytable (կդնի slot-ը, բայց եթե չդնի, կստեղծենք default)
    paytable: null
  };

  // ---- ENGINE STATE (per user per day) ----
  ENGINE.state = {
    userId: null,
    todayKey: null,       // "2025-12-05"
    dailyPaid: 0,         // այսօր արդեն որքան է վճարվել (client-side ստվերային վիճակ)
    totalSpins: 0,
    lastResult: null
  };

  // ---- 20 paylines (մինիմալ, classic ձև) ----
  // Յուրաքանչյուր line = [rowIndex per reel], row = 0..2
  const PAYLINES_20 = [
    [1, 1, 1, 1, 1], // middle
    [0, 0, 0, 0, 0], // top
    [2, 2, 2, 2, 2], // bottom
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 0, 0],
    [2, 2, 1, 2, 2],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
    [0, 1, 0, 1, 0],
    [2, 1, 2, 1, 2],
    [0, 2, 2, 2, 0],
    [2, 0, 0, 0, 2],
    [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1],
    [0, 2, 1, 0, 2],
    [2, 0, 1, 2, 0],
    [0, 1, 2, 2, 2],
    [2, 1, 0, 0, 0],
    [1, 0, 2, 0, 1]
  ];

  ENGINE.paylines = PAYLINES_20;

  // -------- HELPERS --------
  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function rand() {
    return Math.random();
  }

  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Ստեղծում ենք default paytable, եթե slot-ը չտվեց
  function createDefaultPaytable(symbols, wild, scatter) {
    const pt = {};
    symbols.forEach(sym => {
      if (sym === wild || sym === scatter) return;
      pt[sym] = {
        3: 1,  // bet × 1
        4: 3,  // bet × 3
        5: 10  // bet × 10
      };
    });
    // Wild-ի համար
    pt[wild] = {
      3: 2,
      4: 5,
      5: 15
    };
    // Scatter-ի համար գիծ չենք հաշվում, նա ունի առանձին Bet×20 logic
    return pt;
  }

  // ---- INIT ----
  /**
   * init(config, serverState)
   * config: {
   *   symbols: [...14 symbols...],
   *   wild: "WILD",
   *   scatter: "SC",
   *   baseWinChance,
   *   scatterChance,
   *   maxDailyPayout,
   *   bigWinMultiplier,
   *   paytable: {SYM: {3:x,4:y,5:z}}
   * }
   * serverState: { userId, dailyPaid, todayKey, maxDailyPayout }
   */
  ENGINE.init = function (config = {}, serverState = {}) {
    ENGINE.config = Object.assign({}, ENGINE.config, config);

    if (!ENGINE.config.symbols || ENGINE.config.symbols.length === 0) {
      console.warn("DominoEngine: symbols not provided!");
    }

    if (!ENGINE.config.paytable) {
      ENGINE.config.paytable = createDefaultPaytable(
        ENGINE.config.symbols,
        ENGINE.config.wild,
        ENGINE.config.scatter
      );
    }

    ENGINE.state.userId = serverState.userId || null;
    ENGINE.state.todayKey = serverState.todayKey || todayKey();
    ENGINE.state.dailyPaid = serverState.dailyPaid || 0;

    if (serverState.maxDailyPayout) {
      ENGINE.config.maxDailyPayout = serverState.maxDailyPayout;
    }

    ENGINE.state.totalSpins = 0;
    ENGINE.state.lastResult = null;

    console.log("🎰 DominoEngine init:", {
      config: ENGINE.config,
      state: ENGINE.state
    });
  };

  // ---- ADMIN CONTROL (win frequency, daily cap) ----
  /**
   * setControl({ baseWinChance, scatterChance, maxDailyPayout })
   * սա դու կկոչես admin panel-ից կամ backend-ից եկող config-ով
   */
  ENGINE.setControl = function (opts = {}) {
    if (typeof opts.baseWinChance === "number") {
      ENGINE.config.baseWinChance = Math.max(0, Math.min(1, opts.baseWinChance));
    }
    if (typeof opts.scatterChance === "number") {
      ENGINE.config.scatterChance = Math.max(0, Math.min(1, opts.scatterChance));
    }
    if (typeof opts.maxDailyPayout === "number") {
      ENGINE.config.maxDailyPayout = opts.maxDailyPayout;
    }
  };

  // -------- REEL GENERATION LOGIC --------
  /**
   * Ակնկալվող տեսք reels-ի:
   * reels[col][row] → symbol
   * col = 0..4, row = 0..2
   */

  function emptyReels() {
    const reels = [];
    for (let c = 0; c < ENGINE.config.reels; c++) {
      const col = [];
      for (let r = 0; r < ENGINE.config.rows; r++) {
        col.push(null);
      }
      reels.push(col);
    }
    return reels;
  }

  // Պարզ random spin
  function randomReels() {
    const reels = emptyReels();
    const baseSymbols = ENGINE.config.symbols.filter(
      s => s !== ENGINE.config.scatter // scatter քիչ ենք ուզում
    );

    for (let c = 0; c < ENGINE.config.reels; c++) {
      for (let r = 0; r < ENGINE.config.rows; r++) {
        reels[c][r] = choice(baseSymbols);
      }
    }

    // Հնարավոր է հետո այստեղ ավելացնենք փոքր նորմավորում, բայց v1-ի համար հերիք է
    return reels;
  }

  // Scatter placement → միայն reels 0,2,4
  function maybeAddScatters(reels, bet) {
    // որոշենք՝ այս spin-ում scatter տանք, թե ոչ
    if (rand() > ENGINE.config.scatterChance) {
      return { reels, scatterCount: 0, scatterWin: 0 };
    }

    const scatterSymbol = ENGINE.config.scatter;
    let scatterCount = 0;

    // reels 0, 2, 4 (1,3,5 real life)
    const targetReels = [0, 2, 4];

    targetReels.forEach(colIndex => {
      const rowIndex = Math.floor(Math.random() * ENGINE.config.rows);
      reels[colIndex][rowIndex] = scatterSymbol;
      scatterCount++;
    });

    let scatterWin = 0;
    if (scatterCount >= 3) {
      scatterWin = bet * 20; // քո կարգով
    }

    return { reels, scatterCount, scatterWin };
  }

  // ---- LINE WIN CALCULATION ----
  /**
   * Վերադարձնում է՝
   * {
   *   totalLineWin,
   *   lineWins: [{lineIndex, symbol, count, winAmount}]
   * }
   */
  function calculateLineWins(reels, bet) {
    const paytable = ENGINE.config.paytable;
    const wild = ENGINE.config.wild;

    let totalLineWin = 0;
    const lineWins = [];

    for (let li = 0; li < ENGINE.paylines.length; li++) {
      const line = ENGINE.paylines[li];

      // Որոշում ենք հիմնական symbol-ը, որը կհամարենք win-ի համար
      let baseSymbol = null;
      let count = 0;

      for (let c = 0; c < ENGINE.config.reels; c++) {
        const rowIndex = line[c];
        const sym = reels[c][rowIndex];

        if (c === 0) {
          // line-ը պետք է սկսվի reel 0-ից
          if (sym === ENGINE.config.scatter) {
            baseSymbol = null;
            break;
          }
          baseSymbol = sym;
          count = 1;
        } else {
          if (sym === baseSymbol || sym === wild || (baseSymbol === wild && sym !== ENGINE.config.scatter)) {
            count++;
          } else {
            break;
          }
        }
      }

      if (!baseSymbol) continue;
      if (count < 3) continue; // քո պայմանով՝ միայն 3+ վճարում է

      const symbolKey = baseSymbol === wild ? wild : baseSymbol;
      const cfg = paytable[symbolKey];
      if (!cfg) continue;

      const mult = cfg[count] || 0;
      if (mult <= 0) continue;

      const winAmount = bet * mult;
      totalLineWin += winAmount;
      lineWins.push({
        lineIndex: li,
        symbol: baseSymbol,
        count,
        winAmount
      });
    }

    return { totalLineWin, lineWins };
  }

  // ---- MAIN SPIN FUNCTION ----
  /**
   * spin(bet, serverLimitState?)
   * serverLimitState: { dailyPaid, maxDailyPayout } (optional, backend-ից)
   *
   * Վերադարձնում է:
   * {
   *   ok: true/false,
   *   reason?: "daily_limit" | "bet_error",
   *   reels,
   *   lineWins,
   *   scatterCount,
   *   scatterWin,
   *   totalWin,
   *   isWin,
   *   isBigWin,
   *   forcedLoseByLimit
   * }
   */
  ENGINE.spin = function (bet, serverLimitState) {
    bet = Number(bet);
    if (!bet || bet <= 0) {
      return { ok: false, reason: "bet_error" };
    }

    // update daily state from server, եթե կա
    if (serverLimitState) {
      if (typeof serverLimitState.dailyPaid === "number") {
        ENGINE.state.dailyPaid = serverLimitState.dailyPaid;
      }
      if (typeof serverLimitState.maxDailyPayout === "number") {
        ENGINE.config.maxDailyPayout = serverLimitState.maxDailyPayout;
      }
    }

    const currentDay = todayKey();
    if (ENGINE.state.todayKey !== currentDay) {
      ENGINE.state.todayKey = currentDay;
      ENGINE.state.dailyPaid = 0;
    }

    // եթե արդեն անցել ենք limit-ը → backend-ն էլ պիտի նույնը ստուգի, բայց front-ը էլի կպահի
    if (ENGINE.state.dailyPaid >= ENGINE.config.maxDailyPayout) {
      return {
        ok: true,
        reels: randomReels(),
        lineWins: [],
        scatterCount: 0,
        scatterWin: 0,
        totalWin: 0,
        isWin: false,
        isBigWin: false,
        forcedLoseByLimit: true,
        reason: "daily_limit"
      };
    }

    ENGINE.state.totalSpins++;

    // ---- որոշում ենք՝ win spin՞, թե lose spin ----
    // winChance-ը կարող ենք փոքր-ինչ իջեցնել, երբ մոտենում ենք daily limit-ին
    let dynamicWinChance = ENGINE.config.baseWinChance;
    const ratio = ENGINE.state.dailyPaid / ENGINE.config.maxDailyPayout;
    if (ratio > 0.7) {
      dynamicWinChance *= 0.5; // մոտ limit-ին → win-ի հավանականությունը կտրուկ իջնում է
    }

    const isWinSpin = rand() < dynamicWinChance;

    // v1: reels միշտ random ենք ստեղծում, հետո פשוט հաշվում ենք win-ը
    let reels = randomReels();

    // գուցե ավելացնենք scatter
    const scatRes = maybeAddScatters(reels, bet);
    reels = scatRes.reels;
    const scatterCount = scatRes.scatterCount;
    let scatterWin = scatRes.scatterWin || 0;

    // հաշվում ենք line win-երը
    const { totalLineWin, lineWins } = calculateLineWins(reels, bet);

    let totalWin = totalLineWin + scatterWin;
    let realIsWin = totalWin > 0;

    // Եթե engine-ը որոշել էր win տալ, բայց իրականում win չստացվեց (randomReels-ից),
    // ապաՙ կարող ենք փոքր-ինչ ռեգեներացիա անել ապագայում,
    // բայց v1-ում թողնում ենք այդպես՝ winChance = "մոտավոր"
    // Կարող ենք նաև հակառակը անել՝ եթե lose էր, բայց պատահաբար win ստացվեց, թող լինի։

    // DAILY LIMIT CHECK (պաշտոնականն իրականում backend-ում պիտի լինի)
    let forcedLoseByLimit = false;
    if (ENGINE.state.dailyPaid + totalWin > ENGINE.config.maxDailyPayout) {
      // եթե այս հաղթանակը կոտրում է օրական limit-ը → չվճարել (կամ քիթի չափ թողնել)
      forcedLoseByLimit = true;
      totalWin = 0;
      scatterWin = 0;
    }

    // update local dailyPaid
    ENGINE.state.dailyPaid += totalWin;

    const isBigWin = totalWin >= bet * ENGINE.config.bigWinMultiplier;

    const result = {
      ok: true,
      reels,
      lineWins,
      scatterCount,
      scatterWin,
      totalWin,
      isWin: realIsWin && !forcedLoseByLimit,
      isBigWin,
      forcedLoseByLimit,
      reason: forcedLoseByLimit ? "daily_limit" : null
    };

    ENGINE.state.lastResult = clone(result);
    return result;
  };

  // ---- EXPORT ----
  return ENGINE;
})();
