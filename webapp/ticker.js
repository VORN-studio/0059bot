// ========== Withdrawal Ticker ==========
function maskUsername(username) {
  if (!username || username.length <= 4) return username;
  const firstTwo = username.substring(0, 2);
  const lastTwo = username.substring(username.length - 2);
  const middleStars = '*'.repeat(username.length - 4);
  return firstTwo + middleStars + lastTwo;
}

async function loadWithdrawalTicker() {
  try {
    const response = await fetch('/api/withdrawal_ticker');
    const data = await response.json();
    
    if (data.ok && data.withdrawals && data.withdrawals.length > 0) {
      const tickerContent = document.getElementById('ticker-content');
      if (tickerContent) {
        // Create ticker items
        const tickerItems = data.withdrawals.map(w => 
          `<span style="margin: 0 20px; color: #10b981; font-weight: bold;">
            💰 ${maskUsername(w.username)} - ${w.amount} DOMIT
          </span>`
        ).join('');
        
        // Duplicate for seamless scrolling
        tickerContent.innerHTML = tickerItems + tickerItems;
        
        // Adjust animation duration based on content length
        const baseDuration = 30; // seconds
        const durationMultiplier = Math.max(1, data.withdrawals.length / 5);
        tickerContent.style.animationDuration = (baseDuration * durationMultiplier) + 's';
      }
    }
  } catch (error) {
    console.error('Error loading withdrawal ticker:', error);
  }
}

// Load ticker data on page load
document.addEventListener('DOMContentLoaded', loadWithdrawalTicker);

// Refresh ticker data every 5 minutes
setInterval(loadWithdrawalTicker, 5 * 60 * 1000);
