#!/bin/bash
echo "🔧 Setup ambiente per Moto Scraper su Raspberry Pi"
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
mkdir -p ~/moto-scraper
cd ~/moto-scraper
npm init -y
npm install playwright dotenv
npx playwright install chromium
echo "✅ Setup completato"
