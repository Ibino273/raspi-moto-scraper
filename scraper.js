// scraper.js
require('dotenv').config();
const { chromium } = require('playwright');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
  'Mozilla/5.0 (X11; Linux x86_64)...'
];

async function runScraper() {
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--start-fullscreen']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
  });

  const page = await context.newPage();
  console.log("🔍 Apro Subito.it");
  await page.goto('https://www.subito.it/annunci-piemonte/vendita/moto-e-scooter/', {
    timeout: 60000,
    waitUntil: 'domcontentloaded'
  });

  try {
    await page.waitForSelector('button:has-text("Accetta")', { timeout: 7000 });
    await page.click('button:has-text("Accetta")');
    console.log("✅ Cookie accettati");
  } catch (err1) {
    console.log("⚠️ 'Accetta' non trovato, provo con 'Continua senza accettare'...");
    try {
      await page.waitForSelector('text=Continua senza accettare', { timeout: 5000 });
      await page.click('text=Continua senza accettare');
      console.log("✅ Cookie rifiutati");
    } catch (err2) {
      console.log("⚠️ Nessun pulsante cookie cliccabile trovato, continuo lo scraping...");
    }
  }

  const listings = await page.$$eval('a.AdCard-module_link__Dq1UD', links =>
    links.map(link => ({
      titolo: link.querySelector('h2')?.innerText || 'N/A',
      link: link.href,
      prezzo: link.innerText.match(/\u20ac[\d\.]+/)?.[0] || 'N/A',
      luogo: link.innerText.match(/[\w ]+, \d{2}\/\d{2}/)?.[0] || 'N/A',
    }))
  );

  await browser.close();
  console.log("📦 Numero annunci trovati:", listings.length);

  for (const annuncio of listings) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/moto_listings`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([annuncio])
    });
    if (!res.ok) console.error('❌ Errore Supabase:', await res.text());
    else console.log('✅ Inserito:', annuncio.titolo);
  }
}

runScraper().catch(err => console.error('❌ Errore scraper:', err));
