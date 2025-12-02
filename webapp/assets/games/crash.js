async function startCrash() {

    const amount = Number(document.getElementById("bet-amount").value);

    const response = await fetch(`${API_BASE}/api/game/bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: CURRENT_USER_ID,
            amount: amount,
            game: "crash",
            choice: null
        })
    });

    const data = await response.json();

    if (!data.ok) {
        document.getElementById("result").textContent = "Error: " + data.error;
        return;
    }

    document.getElementById("result").textContent =
        data.win ? `You won ${data.payout}$` : "You lost";
}
