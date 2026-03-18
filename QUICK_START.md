# 🚀 YourLab Website - Quick Start Guide

## What You Have

A complete, beautiful business card website with:
- ✨ Modern dark grey design with cyan accents
- 🤖 Intelligent chat agent that collects business ideas
- 💾 Secure data storage (local + server)
- 📱 Fully responsive mobile design
- 🎨 Your logos and Instagram posts integrated
- 📊 Admin dashboard to view all inquiries

## Quick Start (2 minutes)

### Option 1: Test Locally (No Backend Needed)

1. Open the folder in VS Code
2. Install the "Live Server" extension (by Ritwick Dey)
3. Right-click on `index.html` → "Open with Live Server"
4. Test the chat and see data saved in browser

**View saved data:**
Open Browser Developer Console (F12) and type:
```javascript
showSavedConversations()
```

### Option 2: Full Setup with Backend

1. **Install Node.js** (if not already installed)
   - Download from https://nodejs.org/

2. **Install backend dependencies:**
   ```bash
   cd website/server
   npm install
   ```

3. **Configure `.env`:**
   ```bash
   cp .env.example .env
   ```
   Required for production behavior:
   - `OPENAI_API_KEY`
   - `LEAD_NOTIFY_TO`
   - SMTP variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, etc.)

4. **Start the server:**
   ```bash
   npm start
   ```
   You'll see: `YourLab Chat API running on http://localhost:3000`

5. **Open in browser:**
   - Website: http://localhost:3000
   - Admin Dashboard: http://localhost:3000/admin.html

## Features Tour

### 1. Homepage (`index.html`)
- Beautiful header with your logo
- About section
- Gallery of your Instagram posts
- Chat agent section
- Footer

### 2. Chat Agent
The agent automatically:
- Asks about the business idea
- Extracts name, email, and phone
- Guides the conversation
- Saves all data when complete

### 3. Admin Dashboard (`admin.html`)
Access at: `http://localhost:3000/admin.html`

Features:
- 📊 View all inquiries
- 🔍 Search by name, email, or idea
- 📋 Copy inquiry details
- 🗑️ Delete inquiries
- ⬇️ Export as JSON
- 🔄 Auto-refresh

### 4. Data Storage
- **Browser**: `localStorage` (automatic backup)
- **Server**: `server/inquiries/` (as JSON files)
- **Format**: Named by email + timestamp for easy tracking

## Customization

### Change Colors
Edit `styles.css` - look for:
```css
:root {
    --primary-dark: #1a1a1a;      /* Main background */
    --accent-color: #00d4ff;      /* Cyan color */
    /* ... more colors ... */
}
```

### Update Branding
1. Replace logo in `index.html`:
   ```html
   <img src="../Logos YourLab/1.png" alt="YourLab Logo" class="logo">
   ```

2. Gallery images auto-load from your folders

### Modify Chat Behavior
Edit `script.js` - function `processUserMessage()` for conversation logic

## API Endpoints

If running backend:

- `GET /` - View website
- `GET /admin.html` - Admin dashboard
- `POST /api/save-inquiry` - Save inquiry
- `GET /api/inquiries` - View all inquiries
- `GET /api/health` - Server status

## Deployment

### Deploy to Netlify (Frontend)
1. Create GitHub repo
2. Connect to Netlify
3. Deploy folder: `website`

### Deploy Backend to Heroku
```bash
cd website/server
heroku create yourlab-api
git push heroku main
```

### Deploy to Your Server
See `README.md` for detailed instructions

## Troubleshooting

**Chat not saving data?**
- Browser: Check if localStorage is enabled (F12 → Application → Local Storage)
- Server: Check if backend is running (`npm start` in server folder)

**Backend not starting?**
```bash
cd website/server
rm -rf node_modules package-lock.json
npm install
npm start
```

**Images not showing?**
- Check file paths in `index.html`
- Ensure logo files exist in `../Logos YourLab/`
- Ensure images exist in `../post Intro/`

**Port 3000 already in use?**
```bash
# Change port in server.js or set in .env:
PORT=3001 npm start
```

## File Structure

```
website/
├── index.html           ← Main page
├── admin.html           ← Admin dashboard
├── styles.css           ← Styling
├── script.js            ← Chat logic
├── server/
│   ├── server.js        ← Backend
│   ├── package.json
│   ├── .env.example
│   └── inquiries/       ← Saved data
├── README.md
├── QUICK_START.md       ← This file
└── .gitignore
```

## Next Steps

1. ✅ Test the website locally
2. ✅ Try the chat agent
3. ✅ View the admin dashboard
4. ✅ Customize colors and text
5. ✅ Deploy to your server

## Need Help?

Check `README.md` for detailed documentation or ask in the console:
```javascript
console.log('YourLab Chat Agent Ready!')
```

---

**Created:** December 23, 2025
**Version:** 1.0.0
**Company:** YourLab ✨
