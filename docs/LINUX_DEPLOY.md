# YourLab — Linux Server Deployment Guide

Self-hosted on your own machine. No Render, no GitHub Pages, no cloud bills.
One server runs everything: the website, the API, and the AI models.

---

## Architecture Overview

```
Browser (yourlabpt.com)
        │
        ▼
Cloudflare Edge (DNS + HTTPS + DDoS protection)
        │
   [encrypted tunnel]
        │
        ▼
cloudflared daemon  ──────►  localhost:3000
  (on your Linux server)         │
                             Node.js server
                             (serves website + API)
                                  │
                             localhost:11434
                              Ollama daemon
                         (phi3:mini + llama3.1:8b)
```

Your domain stays on Cloudflare DNS. Instead of pointing records at GitHub Pages or Render, traffic flows through a **Cloudflare Tunnel** — an outbound-only encrypted connection from your machine to Cloudflare's edge. No open inbound ports needed.

---

## Prerequisites

- Linux server (Ubuntu 22.04 / 24.04 recommended — adapt commands for other distros)
- SSH access to the server
- Your domain (`yourlabpt.com`) already managed by Cloudflare — i.e. Cloudflare is your nameserver
  - If not, log in to cloudflare.com → Add site → follow the nameserver change instructions with your registrar
- A Cloudflare account (free plan is enough — tunnels are free)
- A GitHub account with the website repository

---

## Step 1 — System Packages

```bash
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git curl wget

# Verify
node -v   # should be v20.x
npm -v
git --version
```

---

## Step 2 — Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

This installs the `ollama` binary and registers a systemd service automatically.

**Enable it to start on boot:**
```bash
sudo systemctl enable ollama
sudo systemctl start ollama

# Verify it's running
sudo systemctl status ollama
```

**Pull the two models** (this downloads ~5 GB, will take a few minutes):
```bash
ollama pull phi3:mini
ollama pull llama3.1:8b
```

You can watch progress live. Once done, verify:
```bash
ollama list
# Should show:
# NAME              ID          SIZE    MODIFIED
# llama3.1:8b       ...         4.7 GB  ...
# phi3:mini         ...         2.2 GB  ...
```

> **Hardware note:** `llama3.1:8b` needs roughly 6–8 GB of RAM to run comfortably.
> If your server has less, change `OLLAMA_MODEL_BIG` to `llama3.2:3b` (3 GB) or `mistral:7b`.
> `phi3:mini` needs ~2 GB and is the fast small-turn model — keep it.

---

## Step 3 — Clone the Repository

```bash
# Choose where to keep the app — /opt is a good convention for server apps
sudo mkdir -p /opt/yourlab
sudo chown $USER:$USER /opt/yourlab

cd /opt/yourlab
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git website
cd website
```

> Replace `YOUR_USERNAME/YOUR_REPO_NAME` with the actual GitHub path.

---

## Step 4 — Configure the Server

```bash
cd /opt/yourlab/website/server

# Install Node.js dependencies
npm install --production

# Create the environment file
cp .env.example .env
nano .env
```

**Fill in `.env` like this** (nano: edit, then Ctrl+O to save, Ctrl+X to exit):

```env
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=https://yourlabpt.com,https://www.yourlabpt.com

# Ollama — these defaults already match the installed setup
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL_BIG=llama3.1:8b
OLLAMA_MODEL_SMALL=phi3:mini
SMALL_MODEL_TURNS=2
CHAT_SESSION_TTL_MS=2700000

# Email notifications for new leads (optional — leave blank to skip)
LEAD_NOTIFY_TO=yourlabpt@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourlabpt@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=YourLab <yourlabpt@gmail.com>
```

> For Gmail, use an **App Password** (Google Account → Security → 2FA → App passwords), not your regular password.

**Test that the server starts:**
```bash
node server.js
# Should print:
# Company knowledge base loaded (XXXX chars)
# YourLab server running on port 3000
```

Press Ctrl+C to stop it — you'll run it as a service in Step 6.

---

## Step 5 — Install Cloudflare Tunnel (cloudflared)

```bash
# Download the latest cloudflared for Linux x86_64
wget -O cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb

# Verify
cloudflared --version
```

> For ARM servers (Raspberry Pi, some VPS): replace `amd64` with `arm64` in the URL.

---

## Step 6 — Authenticate cloudflared with Your Cloudflare Account

```bash
cloudflared tunnel login
```

This prints a URL. Open it in your browser, log in to Cloudflare, and select `yourlabpt.com`. It saves a certificate file at `~/.cloudflared/cert.pem`.

---

## Step 7 — Create the Tunnel

```bash
cloudflared tunnel create yourlab-tunnel
```

This creates a persistent tunnel and prints a **Tunnel ID** (a UUID like `abc12345-...`). Note it — you'll need it.

Confirm it exists:
```bash
cloudflared tunnel list
```

---

## Step 8 — Configure the Tunnel

Create the tunnel config file:

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Paste this, replacing `YOUR_TUNNEL_ID` with the UUID from Step 7:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/YOUR_LINUX_USERNAME/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: yourlabpt.com
    service: http://localhost:3000
  - hostname: www.yourlabpt.com
    service: http://localhost:3000
  # Catch-all required by cloudflared
  - service: http_status:404
```

> Replace `YOUR_LINUX_USERNAME` with the result of `whoami`.

Save and exit (Ctrl+O, Ctrl+X).

---

## Step 9 — Route DNS Through the Tunnel

This command creates the CNAME records in Cloudflare DNS automatically:

```bash
cloudflared tunnel route dns yourlab-tunnel yourlabpt.com
cloudflared tunnel route dns yourlab-tunnel www.yourlabpt.com
```

**Then in the Cloudflare Dashboard:**
1. Go to **yourlabpt.com → DNS → Records**
2. Delete any old records:
   - **A records** pointing to GitHub Pages IPs (`185.199.108.153`, `.109.`, `.110.`, `.111.153`)
   - **CNAME** for `api` or `www` pointing to `yourlab-api.onrender.com` or `cname.github.io`
3. The two new CNAME records (`yourlabpt.com → <id>.cfargotunnel.com` and `www → <id>.cfargotunnel.com`) should already be there from the command above — if not, add them manually copying the pattern
4. Make sure the **Proxy status** (orange cloud) is **ON** for both records — this enables Cloudflare's HTTPS and caching on top of the tunnel

---

## Step 10 — Run Everything as Systemd Services

You want both Ollama and the Node server to start automatically when the machine boots, and restart if they crash.

Ollama is already a systemd service (installed in Step 2). Now create one for the Node server:

```bash
sudo nano /etc/systemd/system/yourlab.service
```

Paste this, replacing `YOUR_LINUX_USERNAME` with `whoami`:

```ini
[Unit]
Description=YourLab Website + API Server
After=network.target ollama.service
Requires=ollama.service

[Service]
Type=simple
User=YOUR_LINUX_USERNAME
WorkingDirectory=/opt/yourlab/website/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Now create the service for cloudflared:

```bash
sudo cloudflared service install
```

This auto-generates a systemd service from your `~/.cloudflared/config.yml`.

**Enable and start everything:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable yourlab
sudo systemctl start yourlab

# cloudflared service was enabled by the install command, just start it:
sudo systemctl start cloudflared

# Check all three are running:
sudo systemctl status ollama
sudo systemctl status yourlab
sudo systemctl status cloudflared
```

All three should say `Active: active (running)`.

---

## Step 11 — Verify End-to-End

```bash
# Test the Node server directly on the machine:
curl http://localhost:3000/api/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"Olá","language":"pt"}'

# Should return a JSON response with "reply" and "usingFallback":false (if Ollama is ready)
# or "usingFallback":true (if models are still loading — wait a minute and retry)
```

Then open `https://yourlabpt.com` in your browser. DNS propagation can take 1–5 minutes (Cloudflare is usually instant since it controls the zone).

---

## Step 12 — Keeping the Code Up To Date

When you push new changes to GitHub, deploy them on the server with:

```bash
cd /opt/yourlab/website
git pull origin main
cd server && npm install --production  # only needed if package.json changed
sudo systemctl restart yourlab
```

Or create a deploy script at `/opt/yourlab/deploy.sh`:

```bash
#!/bin/bash
set -e
cd /opt/yourlab/website
git pull origin main
cd server
npm install --production
sudo systemctl restart yourlab
echo "Deployed successfully."
```

```bash
chmod +x /opt/yourlab/deploy.sh
```

Then deployments are just: `./opt/yourlab/deploy.sh`

---

## Troubleshooting

**Check logs for any service:**
```bash
sudo journalctl -u yourlab -f        # Node server logs (live)
sudo journalctl -u ollama -f         # Ollama logs
sudo journalctl -u cloudflared -f    # Tunnel logs
```

**Ollama isn't responding:**
```bash
curl http://localhost:11434/api/tags   # Should list your pulled models
ollama list                            # Should show phi3:mini and llama3.1:8b
```

**Tunnel connected but site not loading:**
- Check `cloudflared tunnel info yourlab-tunnel` — status should be `HEALTHY`
- Verify DNS records exist in Cloudflare dashboard with proxy ON

**`usingFallback: true` in chat responses:**
- Means Ollama is running but the model isn't loaded yet (first request after boot takes 10–30s to load into RAM)
- Just send the message again after a few seconds

**Out of memory when loading llama3.1:8b:**
```bash
# Check available RAM:
free -h
# If under 7 GB free, switch to a smaller model in /opt/yourlab/website/server/.env:
OLLAMA_MODEL_BIG=llama3.2:3b
# Then:
ollama pull llama3.2:3b
sudo systemctl restart yourlab
```

---

## Optional — Upgrade or Change Models Later

```bash
# Pull a new model:
ollama pull mistral:7b

# Set it as the big model:
nano /opt/yourlab/website/server/.env
# Change: OLLAMA_MODEL_BIG=mistral:7b
sudo systemctl restart yourlab

# Remove a model you no longer need:
ollama rm llama3.1:8b
```

---

## What to Delete / Disable After Migration

- **Render**: Log in to render.com → your service → Settings → Delete service
- **GitHub Pages** (if the repo had it enabled): Repository → Settings → Pages → Source → set to "None"
- `render.yaml` in the repo is now unused but harmless — you can delete it if you want a clean repo
