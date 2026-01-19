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
        // Create ticker items with different colors for real vs fake
        const tickerItems = data.withdrawals.map(w => {
          const color = w.type === 'real' ? '#10b981' : '#f59e0b'; // Green for real, amber for fake
          const icon = w.type === 'real' ? '💰' : '🎯';
          return `<span style="margin: 0 20px; color: ${color}; font-weight: bold;">
            ${icon} ${maskUsername(w.username)} - ${w.amount} TON
          </span>`;
        }).join('');
        
        // Duplicate for seamless scrolling
        tickerContent.innerHTML = tickerItems + tickerItems;
        
        // Adjust animation duration based on content length
        const baseDuration = 30; // seconds
        const durationMultiplier = Math.max(1, data.withdrawals.length / 5);
        tickerContent.style.animationDuration = (baseDuration * durationMultiplier) + 's';
      }
    } else {
      // If no withdrawals, show empty message
      const tickerContent = document.getElementById('ticker-content');
      if (tickerContent) {
        tickerContent.innerHTML = '<span style="margin: 0 20px; color: #64748b; font-weight: bold;">🎯 Выводы скоро начнутся...</span>';
      }
    }
  } catch (error) {
    console.error('Error loading withdrawal ticker:', error);
    // Show error message in ticker
    const tickerContent = document.getElementById('ticker-content');
    if (tickerContent) {
      tickerContent.innerHTML = '<span style="margin: 0 20px; color: #ef4444; font-weight: bold;">❌ Данные о выводах недоступны.</span>';
    }
  }
}

// Load ticker data on page load
document.addEventListener('DOMContentLoaded', loadWithdrawalTicker);

// Refresh ticker data every 2 minutes (more frequent for fake withdrawals)
setInterval(loadWithdrawalTicker, 2 * 60 * 1000);
