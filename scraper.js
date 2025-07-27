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
  headless: true,
  executablePath: '/usr/bin/chromium-browser'
});

  const context = await browser.newContext({
    userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
  });
  const page = await context.newPage();
  console.log("🔍 Apro Subito.it");
  await page.screenshot({ path: 'pagina_subito.png', fullPage: true });
  await page.goto('https://www.subito.it/annunci-piemonte/moto-e-scooter/');
  const listings = await page.$$eval('a.AdCard-module_link__Dq1UD', links =>
    links.map(link => ({
      titolo: link.querySelector('h2')?.innerText || 'N/A',
      link: link.href,
      prezzo: link.innerText.match(/€[\d\.]+/)?.[0] || 'N/A',
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
