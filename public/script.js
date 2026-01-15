// Track all link clicks (including dynamically loaded)
function setupClickTracking() {
    const allLinks = document.querySelectorAll('a[href]');
    
    allLinks.forEach(link => {
        // Skip if already tracked
        if (link.dataset.tracked === 'true') return;
        link.dataset.tracked = 'true';
        
        link.addEventListener('click', (e) => {
            const linkUrl = link.href;
            const linkText = link.getAttribute('data-link-text') || link.textContent.trim();
            
            // Track click asynchronously (don't block navigation)
            trackClick(linkUrl, linkText).catch(err => {
                console.error('Error tracking click:', err);
            });
        });
    });
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    setupClickTracking();
    
    // Re-setup after dynamic content loads
    const observer = new MutationObserver(() => {
        setupClickTracking();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

async function trackClick(linkUrl, linkText) {
    try {
        await fetch('/api/click', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                linkUrl: linkUrl,
                linkText: linkText
            })
        });
    } catch (error) {
        // Silently fail - don't interrupt user experience
        console.error('Failed to track click:', error);
    }
}
