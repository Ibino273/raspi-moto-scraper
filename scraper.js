// scraper.js
require('dotenv').config();
const { chromium } = require('playwright');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lista di user-agent più ampia per simulare browser diversi
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/109.0.1518.78',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.86 Mobile Safari/537.36'
];

// Funzione per generare un ritardo casuale
const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Funzione per implementare la logica di retry per operazioni fallite
async function withRetry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`Tentativo ${i + 1} fallito. Riprovo in ${delay / 1000} secondi...`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Aumenta il ritardo per i tentativi successivi
      } else {
        throw error; // Rilancia l'errore dopo l'ultimo tentativo
      }
    }
  }
}

async function runScraper() {
  let browser;
  // URL base per gli annunci di moto e scooter in Piemonte
  const BASE_URL = 'https://www.subito.it/annunci-piemonte/vendita/moto-e-scooter/';
  let pageNumber = 1;
  const maxPagesToScrape = 5; // Limite massimo di pagine da scansionare per evitare cicli infiniti

  try {
    // Avvia il browser Chromium con le tue configurazioni specifiche
    browser = await withRetry(() => chromium.launch({
      headless: false, // Mantenuto da te
      executablePath: '/usr/bin/chromium-browser', // Mantenuto da te
      args: ['--start-fullscreen'] // Mantenuto da te
    }), 3, 2000);

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }, // Mantenuto da te
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    });

    const page = await context.newPage();
    let totalListingsScraped = 0;

    while (pageNumber <= maxPagesToScrape) {
      const url = pageNumber === 1 ? BASE_URL : `${BASE_URL}?o=${pageNumber}`;
      console.log(`🌐 Navigazione a ${url} (Pagina ${pageNumber})...`);

      try {
        await withRetry(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }), 3, 5000);
        console.log(`✅ Pagina ${pageNumber} caricata.`);
      } catch (navigationError) {
        console.error(`❌ Errore di navigazione alla pagina ${pageNumber}:`, navigationError.message);
        break; // Interrompi lo scraping se la navigazione fallisce
      }

      // Gestione dei cookie (mantenuta dalla tua versione)
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

      // Estrai gli annunci con selezione più robusta
      // Cerca tutti i link che contengono "/annunci-" nel loro href, che è più stabile.
      const listings = await page.$$eval('a[href*="/annunci-"]', links =>
        links.map(link => {
          const titleElement = link.querySelector('h2');
          const priceMatch = link.innerText.match(/€[\d\.]+/); // Mantenuto il tuo regex per il prezzo
          const locationMatch = link.innerText.match(/[\w ]+, \d{2}\/\d{2}/);

          // Filtra i link che non sembrano essere annunci validi (es. link generici del sito)
          if (!titleElement || !priceMatch) {
            return null; // Ritorna null per i link non validi, verranno filtrati dopo
          }

          // Normalizzazione del prezzo: rimuove il simbolo dell'euro e i punti, poi converte in float
          const prezzoNormalizzato = parseFloat(priceMatch[0].replace(/€|\./g, '').replace(',', '.'));

          // Estrazione e normalizzazione di città e data dal luogo
          let citta = 'N/A';
          let dataAnnuncio = null;
          if (locationMatch) {
            const parts = locationMatch[0].split(', ');
            if (parts.length >= 1) {
              citta = parts[0].trim();
            }
            if (parts.length >= 2) {
              const dateParts = parts[1].split('/');
              if (dateParts.length === 2) {
                const day = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]);
                const currentYear = new Date().getFullYear();
                dataAnnuncio = new Date(currentYear, month - 1, day).toISOString().split('T')[0]; // Formato YYYY-MM-DD
              }
            }
          }

          return {
            titolo: titleElement.innerText.trim(),
            link: link.href,
            prezzo: prezzoNormalizzato,
            citta: citta,
            data_annuncio: dataAnnuncio,
            data_scraping: new Date().toISOString() // Aggiunge la data di scraping
          };
        }).filter(item => item !== null) // Filtra gli elementi nulli (link non validi)
      );

      if (listings.length === 0) {
        console.log(`ℹ️ Nessun annuncio valido trovato sulla pagina ${pageNumber}. Fine della paginazione.`);
        break; // Nessun annuncio, fine della paginazione
      }

      console.log(`🔍 Trovati ${listings.length} annunci sulla pagina ${pageNumber}.`);
      totalListingsScraped += listings.length;

      // Inserisci gli annunci in Supabase con logica di retry
      for (const annuncio of listings) {
        console.log(`⏳ Tentativo di inserimento: ${annuncio.titolo}`);
        try {
          await withRetry(async () => {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/moto_listings`, {
              method: 'POST',
              headers: {
                apikey: SUPABASE_API_KEY,
                Authorization: `Bearer ${SUPABASE_API_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates' // Aggiorna se esiste già un record con la stessa chiave primaria
              },
              body: JSON.stringify([annuncio])
            });

            if (!res.ok) {
              const errorText = await res.text();
              throw new Error(`Errore Supabase (${res.status}): ${errorText}`);
            } else {
              console.log(`✅ Inserito con successo: ${annuncio.titolo}`);
            }
          }, 5, 2000); // 5 tentativi, ritardo iniziale di 2 secondi
        } catch (fetchErr) {
          console.error(`❌ Fallimento definitivo per "${annuncio.titolo}":`, fetchErr.message);
          // Qui si potrebbe aggiungere una logica per inviare notifiche (es. email/Slack)
        }
        // Aggiungi un ritardo casuale tra le richieste a Supabase per evitare sovraccarichi
        await page.waitForTimeout(getRandomDelay(500, 2000));
      }

      pageNumber++;
      // Aggiungi un ritardo tra una pagina e l'altra per simulare un comportamento più umano
      await page.waitForTimeout(getRandomDelay(2000, 5000));
    }

    console.log(`🎉 Scraping completato. Totale annunci scansionati: ${totalListingsScraped}`);

  } catch (err) {
    console.error('❌ Errore critico nello scraper:', err.message);
    // Qui si potrebbe aggiungere una logica per inviare notifiche di errore critico
  } finally {
    if (browser) {
      await browser.close();
      console.log('🚪 Browser chiuso.');
    }
  }
}

// Esegui lo scraper e gestisci eventuali errori non catturati
runScraper().catch(err => console.error('❌ Errore non gestito dall\'applicazione:', err));
