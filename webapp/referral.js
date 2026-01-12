// Referral System JavaScript
async function loadReferralStats() {
  if (!CURRENT_USER_ID) return;
  
  try {
    const response = await fetch(`/api/referral_stats?user_id=${CURRENT_USER_ID}`);
    const data = await response.json();
    
    if (data.ok) {
      // Update tier badge
      const tierBadge = document.getElementById('ref-tier-badge');
      if (tierBadge) {
        tierBadge.textContent = data.tier_info.name;
      }
      
      // Update progress bar
      const progressBar = document.getElementById('tier-progress');
      const progressText = document.getElementById('tier-progress-text');
      if (progressBar && progressText) {
        progressBar.style.width = `${data.progress}%`;
        if (data.tier === 'bronze') {
          progressText.textContent = `${data.active_refs}/6 ակտիվ ռեֆերալ`;
        } else {
          progressText.textContent = `${data.active_refs} ակտիվ ռեֆերալ (Մաքսիմում)`;
        }
      }
      
      // Update stats
      const refTotal = document.getElementById('ref-total');
      const refActive = document.getElementById('ref-active');
      const refEarnings = document.getElementById('ref-earnings');
      const refDeposits = document.getElementById('ref-deposits');
      
      if (refTotal) refTotal.textContent = data.total_refs;
      if (refActive) refActive.textContent = data.active_refs;
      if (refEarnings) refEarnings.textContent = `${data.referral_earnings} DOMIT`;
      if (refDeposits) refDeposits.textContent = `${data.team_deposits} DOMIT`;
      
      // Update benefits
      const benefitsList = document.getElementById('benefits-list');
      if (benefitsList) {
        benefitsList.innerHTML = '';
        data.benefits.forEach(benefit => {
          const li = document.createElement('li');
          li.style.margin = '5px 0';
          li.textContent = benefit;
          benefitsList.appendChild(li);
        });
      }
      
      // Update next tier section
      const nextTier = document.getElementById('next-tier');
      if (nextTier) {
        if (data.tier === 'bronze') {
          nextTier.style.display = 'block';
          const needed = data.tier_info.next_needed - data.active_refs;
          nextTier.querySelector('h4').textContent = '📈 Հաջորդ մակարդակ՝ Gold';
          nextTier.querySelector('p').textContent = `Պահանջվում է ևս ${needed} ակտիվ ռեֆերալ`;
        } else {
          nextTier.style.display = 'none';
        }
      }
    }
  } catch (error) {
    console.error('Error loading referral stats:', error);
  }
}

// Override the initReferralLink function to include stats loading
const originalInitReferralLink = window.initReferralLink;
window.initReferralLink = function() {
  if (originalInitReferralLink) {
    originalInitReferralLink();
  }
  loadReferralStats();
};
