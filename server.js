const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize database
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const db = new Database(path.join(dataDir, 'links.db'));

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_url TEXT NOT NULL,
    link_text TEXT,
    ip_address TEXT,
    user_agent TEXT,
    clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_link_url ON clicks(link_url);
  CREATE INDEX IF NOT EXISTS idx_clicked_at ON clicks(clicked_at);
`);

// API: Track click
app.post('/api/click', (req, res) => {
  const { linkUrl, linkText } = req.body;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') || 'unknown';

  try {
    const stmt = db.prepare(`
      INSERT INTO clicks (link_url, link_text, ip_address, user_agent)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(linkUrl, linkText || linkUrl, ip, userAgent);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get statistics
app.get('/api/stats', (req, res) => {
  try {
    // Total clicks
    const totalClicks = db.prepare('SELECT COUNT(*) as count FROM clicks').get();
    
    // Clicks by link
    const clicksByLink = db.prepare(`
      SELECT 
        link_url,
        link_text,
        COUNT(*) as clicks,
        COUNT(DISTINCT ip_address) as unique_visitors
      FROM clicks
      GROUP BY link_url
      ORDER BY clicks DESC
    `).all();
    
    // Recent clicks (last 50)
    const recentClicks = db.prepare(`
      SELECT 
        link_url,
        link_text,
        ip_address,
        user_agent,
        clicked_at
      FROM clicks
      ORDER BY clicked_at DESC
      LIMIT 50
    `).all();
    
    // Clicks by day (last 30 days)
    const clicksByDay = db.prepare(`
      SELECT 
        DATE(clicked_at) as date,
        COUNT(*) as clicks
      FROM clicks
      WHERE clicked_at >= datetime('now', '-30 days')
      GROUP BY DATE(clicked_at)
      ORDER BY date DESC
    `).all();

    res.json({
      totalClicks: totalClicks.count,
      clicksByLink,
      recentClicks,
      clicksByDay
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve index page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve stats page
app.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stats.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
