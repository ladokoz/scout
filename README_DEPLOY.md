# 🚀 Deployment Guide (Proxmox + Cloudflare)

This guide provides the fastest way to host the **Ahub Film Scout** on a Debian-based server (LXC or VM) using Cloudflare Tunnels for secure access without port forwarding.

## 1. Server Setup (LXC or VM)
1. **Host**: Proxmox
2. **Template**: Debian 12 (bookworm)
3. **Specs**: 1 CPU Core, 512MB RAM is sufficient.

## 2. Installation
Run these commands in your server terminal:

```bash
# Update and install Python tools
sudo apt update && sudo apt upgrade -y
sudo apt install python3-pip python3-venv curl git -y

# Download and install Cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

## 3. Clone & Initialize
```bash
git clone <your-repo-short-film-scout> scout
cd scout

# Give permissions to the start script
chmod +x run.sh

# Initial setup (creates venv and installs dependencies)
./run.sh
```

## 4. Configuration
Create your configuration file for API keys:
```bash
nano .env
```
Paste your keys:
```env
YOUTUBE_API_KEY=your_key_here
VIMEO_CLIENT_ID=your_id_here
VIMEO_CLIENT_SECRET=your_secret_here
```

## 5. Expose to Web (Cloudflare Tunnel)
In a separate terminal (or `screen` session):

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create the tunnel
cloudflared tunnel create scout-box

# Map your domain (e.g. scout.yourdomain.com)
cloudflared tunnel route dns scout-box scout.yourdomain.com

# Start the tunnel pointing to our local port 8001
cloudflared tunnel run --url http://localhost:8001 scout-box
```

## 6. Access
Your Film Scout is now live at **`https://scout.yourdomain.com`**.

---

### Tips for Servers:
- **Persistence**: Use `tmux` or `screen` to keep both `./run.sh` and the `cloudflared` command running in the background.
- **Port**: The application listens on port `8001` by default.
- **Deduplication**: The engine handles cross-platform deduplication automatically, so your results will always be clean!
