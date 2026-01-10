// Portal notification function
function showPortalNotification() {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        font-weight: bold;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(238, 90, 36, 0.4);
        animation: slideDown 0.3s ease-out;
        max-width: 90%;
        text-align: center;
    `;
    notification.innerHTML = '🚫 Portal-ը ժամանակավոր փակ է։ Կփորձեք ավելի ուշ։';
    
    // Add animation keyframes if not exists
    if (!document.getElementById('portal-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'portal-notification-styles';
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            @keyframes slideUp {
                from {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}
