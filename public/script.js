// Track all link clicks
document.addEventListener('DOMContentLoaded', () => {
    const allLinks = document.querySelectorAll('a[href]');
    
    allLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const linkUrl = link.href;
            const linkText = link.getAttribute('data-link-text') || link.textContent.trim();
            
            // Track click asynchronously (don't block navigation)
            trackClick(linkUrl, linkText).catch(err => {
                console.error('Error tracking click:', err);
            });
        });
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
