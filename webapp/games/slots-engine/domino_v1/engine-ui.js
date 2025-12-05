// ==========================================
// Domino Slots – UI Controller (REAL BALANCE)
// ==========================================

console.log("🎮 engine-ui.js REAL BALANCE loaded");

window.UI = (function () {

    const tg = window.Telegram && window.Telegram.WebApp;
    const API = window.location.origin;

    function getUid() {
        const url = new URLSearchParams(window.location.search);
        return tg?.initDataUnsafe?.user?.id || Number(url.get("uid"));
    }

    let USER_ID = getUid();

    // -------------------------------
    // GAME CONFIG (symbols from your folder)
    // -------------------------------
    const SYMBOLS = [
        "9", "10", "a1", "bonus",
        "book", "clover", "crystal", "domino",
        "gem", "horseshoe", "j1", "k1",
        "q1", "star", "wild"
    ];

    const SYMBOL_IMAGES = {
        "9": "symbols1/9.png",
        "10": "symbols1/10.png",
        "a1": "symbols1/a1.png",
        "bonus": "symbols1/bonus.png",
        "book": "symbols1/book.png",
        "clover": "symbols1/clover.png",
        "crystal": "symbols1/crystal.png",
        "domino": "symbols1/domino.png",
        "gem": "symbols1/gem.png",
        "horseshoe": "symbols1/horseshoe.png",
        "j1": "symbols1/j1.png",
        "k1": "symbols1/k1.png",
        "q1": "symbols1/q1.png",
        "star": "symbols1/star.png",
        "wild": "symbols1/wild.png",
    };

    // -------------------------------
    // REAL BALANCE (from backend)
    // -------------------------------
    let mainBalance = 0;   // ← REAL MONEY USER BALANCE
    let bet = 100;

    let isSpinning = false;
    let autoPlay = false;
    let autoPlayTimer = null;

    const reelsGrid = document.getElementById("reelsGrid");
    const spinBtn = document.getElementById("spinBtn");

    // -------------------------------
    // LOAD USER BALANCE FROM BACKEND
    // -------------------------------
    async function loadBalance() {
        try {
            const r = await fetch(`${API}/api/user/${USER_ID}`);
            const js = await r.json();
            if (!js.ok) return alert("User not found!");

            mainBalance = js.user.balance_usd;
            updateUI();
        } catch (e) {
            console.log("Balance load error:", e);
        }
    }

    // -------------------------------
    // UPDATE UI
    // -------------------------------
    function updateUI() {
        document.getElementById("mainBalance").innerText = "$" + mainBalance.toFixed(2);
        document.getElementById("slotsBalance").innerText = "$" + mainBalance.toFixed(2);
        document.getElementById("betValue").innerText = bet;
    }

    // -------------------------------
    // INIT ENGINE (20 paylines already inside engine.js)
    // -------------------------------
    DominoEngine.init({
        symbols: SYMBOLS,
        wild: "wild",
        scatter: "bonus",
        baseWinChance: 0.36,
        scatterChance: 0.04,
        maxDailyPayout: 2000,
        bigWinMultiplier: 30
    });

    // -------------------------------
    // RENDER REELS
    // -------------------------------
    function renderReels(reels) {
        reelsGrid.innerHTML = "";

        for (let col = 0; col < reels.length; col++) {
            const colDiv = document.createElement("div");
            colDiv.className = "reel";

            const mask = document.createElement("div");
            mask.className = "reel-mask";

            const strip = document.createElement("div");
            strip.className = "strip";

            for (let row = 0; row < reels[col].length; row++) {
                const cell = document.createElement("div");
                cell.className = "symbol-cell";

                const inner = document.createElement("div");
                inner.className = "symbol-inner";

                const img = document.createElement("img");
                img.className = "symbol-image";
                img.src = SYMBOL_IMAGES[reels[col][row]];

                inner.appendChild(img);
                cell.appendChild(inner);
                strip.appendChild(cell);
            }

            mask.appendChild(strip);
            colDiv.appendChild(mask);
            reelsGrid.appendChild(colDiv);
        }
    }

    // -------------------------------
    // SPIN ANIMATIONS
    // -------------------------------
    function startSpinAnimation() {
        document.querySelectorAll(".reel").forEach(r => r.classList.add("spinning"));
    }

    function stopSpinAnimation() {
        document.querySelectorAll(".reel").forEach(r => r.classList.remove("spinning"));
    }

    // -------------------------------
    // WIN BANNER
    // -------------------------------
    function showWin(multiplier) {
        const banner = document.getElementById("winBanner");
        const winAmount = document.getElementById("winAmount");

        winAmount.innerText = "X" + multiplier;
        banner.classList.add("visible");

        setTimeout(() => banner.classList.remove("visible"), 1800);
    }

    // -------------------------------
    // SPIN (WITH REAL BALANCE)
    // -------------------------------
    async function spin() {
        if (isSpinning) return;

        if (bet > mainBalance)
            return alert("Բավարար բալանս չկա!");

        isSpinning = true;
        spinBtn.classList.add("spinning");
        startSpinAnimation();

        const result = DominoEngine.spin(bet);

        setTimeout(async () => {
            stopSpinAnimation();
            spinBtn.classList.remove("spinning");
            isSpinning = false;

            // SHOW SYMBOLS
            renderReels(result.reels);

            // CALCULATE NET PROFIT
            const win = result.totalWin;
            const net = win - bet;

            mainBalance += net;
            if (mainBalance < 0) mainBalance = 0;

            updateUI();

            if (result.isWin) {
                let m = Math.floor(win / bet);
                showWin(m);
            }

            if (autoPlay && mainBalance >= bet) {
                autoPlayTimer = setTimeout(spin, 500);
            }

        }, 1400);
    }

    // -------------------------------
    // BET CONTROL
    // -------------------------------
    function changeBet(amount) {
        bet += amount;
        if (bet < 10) bet = 10;
        updateUI();
    }

    // -------------------------------
    // AUTOPLAY
    // -------------------------------
    function toggleAutoPlay() {
        autoPlay = !autoPlay;

        const btn = document.getElementById("autoBtn");

        if (autoPlay) {
            btn.classList.add("active");
            spin();
        } else {
            btn.classList.remove("active");
            clearTimeout(autoPlayTimer);
        }
    }

    // -------------------------------
    // BACK BUTTON
    // -------------------------------
    function back() {
        window.location.href = `${window.location.origin}/webapp/games/slots.html?uid=${USER_ID}`;
    }

    // -------------------------------
    // INITIAL REELS + BALANCE LOAD
    // -------------------------------
    loadBalance();

    renderReels([
        ["9", "10", "a1"],
        ["bonus", "book", "clover"],
        ["crystal", "domino", "gem"],
        ["horseshoe", "j1", "k1"],
        ["q1", "star", "wild"]
    ]);

    // -------------------------------
    // EXPORT PUBLIC METHODS
    // -------------------------------
    return {
        spin,
        changeBet,
        toggleAutoPlay,
        back
    };

})();
