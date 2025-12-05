// ==========================================
// Domino Slots – UI Controller for Engine v1
// ==========================================

console.log("🎮 engine-ui.js loaded");

window.UI = (function () {

    // -------------------------------
    // GAME CONFIG (connect with engine)
    // -------------------------------
    const SYMBOLS = [
        "A", "K", "Q", "J", "10", "9",
        "CAT", "RING", "COIN", "SWORD",
        "MASK", "CROWN",
        "WILD", "SCATTER"
    ];

    const SYMBOL_IMAGES = {
        "A": "symbols/A.png",
        "K": "symbols/K.png",
        "Q": "symbols/Q.png",
        "J": "symbols/J.png",
        "10": "symbols/10.png",
        "9": "symbols/9.png",
        "CAT": "symbols/cat.png",
        "RING": "symbols/ring.png",
        "COIN": "symbols/coin.png",
        "SWORD": "symbols/sword.png",
        "MASK": "symbols/mask.png",
        "CROWN": "symbols/crown.png",
        "WILD": "symbols/wild.png",
        "SCATTER": "symbols/scatter.png",
    };

    // -------------------------------
    // GAME STATE
    // -------------------------------
    let mainBalance = 10000;
    let slotsBalance = 5000;
    let bet = 100;

    let isSpinning = false;
    let autoPlay = false;
    let autoPlayTimer = null;

    const reelsGrid = document.getElementById("reelsGrid");
    const spinBtn = document.getElementById("spinBtn");

    // -------------------------------
    // INIT ENGINE
    // -------------------------------
    DominoEngine.init({
        symbols: SYMBOLS,
        wild: "WILD",
        scatter: "SCATTER",
        baseWinChance: 0.35,
        scatterChance: 0.04,
        maxDailyPayout: 1500,
        bigWinMultiplier: 30
    });

    // -------------------------------
    // UI UPDATE FUNCTIONS
    // -------------------------------
    function updateBalances() {
        document.getElementById("mainBalance").innerText = "$" + mainBalance;
        document.getElementById("slotsBalance").innerText = "$" + slotsBalance;
        document.getElementById("betValue").innerText = bet;
    }

    updateBalances();

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
    // SPIN ANIMATION (FAKE UI SPIN)
    // -------------------------------
    function startSpinAnimation() {
        const reels = document.querySelectorAll(".reel");
        reels.forEach(r => r.classList.add("spinning"));
    }

    function stopSpinAnimation() {
        const reels = document.querySelectorAll(".reel");
        reels.forEach(r => r.classList.remove("spinning"));
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
    // MAIN SPIN BUTTON
    // -------------------------------
    function spin() {
        if (isSpinning) return;
        if (slotsBalance < bet) return alert("Not enough balance!");

        isSpinning = true;
        spinBtn.classList.add("spinning");

        startSpinAnimation();

        const result = DominoEngine.spin(bet);

        // Wait ~1.4 sec for animation
        setTimeout(() => {
            stopSpinAnimation();
            spinBtn.classList.remove("spinning");
            isSpinning = false;

            // Render reels
            renderReels(result.reels);

            // Handle win
            if (result.totalWin > 0) {
                slotsBalance += result.totalWin;
            } else {
                slotsBalance -= bet;
            }

            updateBalances();

            // Win banner
            if (result.isWin) {
                let multi = Math.floor(result.totalWin / bet);
                showWin(multi);
            }

            // Autoplay continue
            if (autoPlay) {
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
        updateBalances();
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
    // BACK
    // -------------------------------
    function back() {
        alert("Back pressed. Connect to Telegram WebApp.");
    }

    // -------------------------------
    // INITIAL EMPTY RENDER
    // -------------------------------
    renderReels([
        ["A", "K", "Q"],
        ["J", "10", "9"],
        ["CAT", "RING", "COIN"],
        ["MASK", "CROWN", "A"],
        ["WILD", "SCATTER", "K"]
    ]);

    // -------------------------------
    // EXPORT FUNCTIONS
    // -------------------------------
    return {
        spin,
        changeBet,
        toggleAutoPlay,
        back
    };

})();
