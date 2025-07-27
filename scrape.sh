#!/bin/bash
cd ~/moto-scraper
echo "🚀 Avvio scraping alle $(date)" >> scrape.log
node scraper.js >> scrape.log 2>&1
echo "✅ Fine scraping alle $(date)" >> scrape.log
