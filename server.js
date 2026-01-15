const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(session({
  secret: 'links-app-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Auth credentials
const AUTH_USERNAME = 'gusev';
const AUTH_PASSWORD = 'Killthemall1';

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  // For API requests, return 401, for page requests, redirect
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/login');
}

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

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL,
    subtitle TEXT,
    icon_svg TEXT,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_category ON links(category);
  CREATE INDEX IF NOT EXISTS idx_display_order ON links(display_order);
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

// Login page
app.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    const redirect = req.query.redirect || '/admin';
    return res.redirect(redirect);
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    req.session.authenticated = true;
    const redirect = req.query.redirect || '/admin';
    res.redirect(redirect);
  } else {
    res.redirect('/login?error=invalid');
  }
});

// Logout handler
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/login');
  });
});

// API: Get statistics (protected)
app.get('/api/stats', requireAuth, (req, res) => {
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

// Serve stats page (protected)
app.get('/stats', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stats.html'));
});

// API: Get all links (public)
app.get('/api/links', (req, res) => {
  try {
    const links = db.prepare(`
      SELECT id, text, url, category, subtitle, icon_svg, display_order
      FROM links
      ORDER BY category, display_order, id
    `).all();
    
    res.json({ links });
  } catch (error) {
    console.error('Error getting links:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get all links for admin (protected)
app.get('/api/admin/links', requireAuth, (req, res) => {
  try {
    const links = db.prepare(`
      SELECT id, text, url, category, subtitle, icon_svg, display_order, created_at, updated_at
      FROM links
      ORDER BY category, display_order, id
    `).all();
    
    res.json({ links });
  } catch (error) {
    console.error('Error getting links:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Create link (protected)
app.post('/api/admin/links', requireAuth, (req, res) => {
  try {
    const { text, url, category, subtitle, icon_svg, display_order } = req.body;
    
    if (!text || !url || !category) {
      return res.status(400).json({ error: 'Text, URL, and category are required' });
    }
    
    const stmt = db.prepare(`
      INSERT INTO links (text, url, category, subtitle, icon_svg, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(text, url, category, subtitle || null, icon_svg || null, display_order || 0);
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error creating link:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Update link (protected)
app.put('/api/admin/links/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { text, url, category, subtitle, icon_svg, display_order } = req.body;
    
    const stmt = db.prepare(`
      UPDATE links
      SET text = ?, url = ?, category = ?, subtitle = ?, icon_svg = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(text, url, category, subtitle || null, icon_svg || null, display_order || 0, id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating link:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Delete link (protected)
app.delete('/api/admin/links/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    
    const stmt = db.prepare('DELETE FROM links WHERE id = ?');
    stmt.run(id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting link:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve admin page (protected)
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
