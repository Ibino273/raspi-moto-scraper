// scraper.js
require('dotenv').config();
const { chromium } = require('playwright');
const fetch = require('node-fetch'); // Assicurati che node-fetch sia installato: npm install node-fetch

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

  let nuoviAnnunci = 0;
  let annunciAggiornati = 0;

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

      // Estrai gli annunci utilizzando i selettori più robusti dallo script Deno
      const listings = await page.$$eval('li[data-testid="listing-container"]', items =>
        items.map(item => {
          // Estrai l'elemento del link principale e il suo href
          const linkElement = item.querySelector('a[href*="/annunci/"]');
          const relativeUrl = linkElement?.getAttribute('href');
          let subito_id = null;
          let fullUrl = null;

          if (relativeUrl) {
            // Estrai subito_id dall'URL (es. /annunci/provincia/categoria/id.htm)
            const urlParts = relativeUrl.split('/');
            subito_id = urlParts[urlParts.length - 1]?.replace('.htm', '');
            fullUrl = `https://www.subito.it${relativeUrl}`; // Costruisce l'URL completo
          }

          // Estrai il titolo usando il selettore specifico
          const titoloElement = item.querySelector('h2.SmallCardModule_item-data__title');
          const titolo = titoloElement?.textContent?.trim() || 'Senza titolo';

          // Estrai il prezzo usando il selettore specifico
          const prezzoElement = item.querySelector('div.SmallCardModule_item-data__price span');
          let prezzo = null;
          if (prezzoElement) {
            const prezzoText = prezzoElement.textContent?.trim();
            if (prezzoText) {
              // Pulisce il testo del prezzo: rimuove il simbolo di valuta, gli spazi e sostituisce la virgola con il punto per il parsing
              const cleanedPrice = prezzoText.replace(/€|\s/g, '').replace(',', '.');
              prezzo = parseFloat(cleanedPrice);
            }
          }

          // Estrai l'URL dell'immagine usando il selettore specifico
          const imgElement = item.querySelector('img.SmallCardModule_picture__image');
          const immagine_url = imgElement?.getAttribute('src') || null;

          // Inizializza marca e modello a null; verranno sovrascritti dalla pagina di dettaglio se trovati
          let marca = null;
          let modello = null;

          // Aggiungi l'annuncio parsato all'elenco se i dati essenziali sono presenti
          if (subito_id && titolo && fullUrl) {
            return {
              subito_id,
              titolo,
              url: fullUrl,
              prezzo,
              immagine_url,
              marca, // Sarà aggiornato dalla pagina di dettaglio
              modello, // Sarà aggiornato dalla pagina di dettaglio
              descrizione: null, // Sarà aggiornato dalla pagina di dettaglio
              likes: null, // Sarà aggiornato dalla pagina di dettaglio
              data_scraping: new Date().toISOString() // Aggiunge la data di scraping
            };
          } else {
              console.warn(`Saltando annuncio incompleto. ID: ${subito_id}, Titolo: ${titolo}, URL: ${fullUrl}`);
              return null;
          }
        }).filter(item => item !== null) // Filtra gli elementi nulli (link non validi)
      );

      if (listings.length === 0) {
        console.log(`ℹ️ Nessun annuncio valido trovato sulla pagina ${pageNumber}. Fine della paginazione.`);
        break; // Nessun annuncio, fine della paginazione
      }

      console.log(`🔍 Trovati ${listings.length} annunci sulla pagina ${pageNumber}.`);
      totalListingsScraped += listings.length;

      // Inserisci/Aggiorna gli annunci in Supabase con logica esplicita (come nello script Deno)
      for (const annuncio of listings) {
        console.log(`⏳ Elaborazione annuncio: ${annuncio.titolo}`);
        let detailPage;
        try {
          // Apre una nuova pagina per visitare il dettaglio dell'annuncio
          detailPage = await context.newPage();
          console.log(`🌐 Navigazione alla pagina dettaglio: ${annuncio.url}`);
          await withRetry(() => detailPage.goto(annuncio.url, { waitUntil: 'domcontentloaded', timeout: 60000 }), 3, 5000);
          console.log(`✅ Pagina dettaglio caricata per: ${annuncio.titolo}`);

          // --- Estrazione dati dalla pagina di dettaglio ---
          // Descrizione
          const descrizioneElement = await detailPage.$('p.AdDescription-module_description__E54FP');
          annuncio.descrizione = (await descrizioneElement?.textContent())?.trim() || null;

          // Likes (se presente)
          const likesElement = await detailPage.$('span.Heart-module_counter-wrapper__N1thb');
          annuncio.likes = parseInt((await likesElement?.textContent())?.trim()) || 0; // Converte in numero, 0 se non trovato

          // Marca e Modello dai selettori specifici forniti
          // Attenzione: questi selettori (nth-of-type e classi dinamiche) potrebbero essere fragili.
          // La loro robustezza dipende dalla stabilità della struttura HTML del sito.
          const marcaElement = await detailPage.$('div:nth-of-type(1) span.feature-list__value__SZDq2');
          annuncio.marca = (await marcaElement?.textContent())?.trim() || annuncio.marca; // Sovrascrive o mantiene il valore esistente

          const modelloElement = await detailPage.$('div:nth-of-type(2) span.feature-list__value__SZDq2');
          annuncio.modello = (await modelloElement?.textContent())?.trim() || annuncio.modello; // Sovrascrive o mantiene il valore esistente

          // Aggiungi un piccolo ritardo dopo aver estratto i dati dalla pagina di dettaglio
          await detailPage.waitForTimeout(getRandomDelay(200, 1000));

        } catch (detailPageError) {
          console.error(`❌ Errore durante lo scraping della pagina dettaglio per "${annuncio.titolo}":`, detailPageError.message);
          // Continua con il prossimo annuncio anche se lo scraping della pagina di dettaglio fallisce
        } finally {
          if (detailPage) {
            await detailPage.close(); // Chiude la pagina di dettaglio dopo l'elaborazione
          }
        }

        // --- Inserisci/Aggiorna in Supabase ---
        try {
          await withRetry(async () => {
            // Controlla se l'annuncio esiste già in Supabase
            const check = await fetch(`${SUPABASE_URL}/rest/v1/moto_listings?subito_id=eq.${annuncio.subito_id}&select=id`, {
              headers: {
                'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                'apikey': SUPABASE_API_KEY,
                'Content-Type': 'application/json'
              }
            });
            const existing = await check.json();

            // Dati dell'annuncio da inserire/aggiornare
            const annuncioData = {
                ...annuncio,
                data_scraping: new Date().toISOString() // Aggiorna il timestamp di scraping
            };

            if (existing.length > 0) {
              // Se esiste, aggiorna il record
              const update = await fetch(`${SUPABASE_URL}/rest/v1/moto_listings?subito_id=eq.${annuncio.subito_id}`, {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                  'apikey': SUPABASE_API_KEY,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(annuncioData)
              });
              if (update.ok) {
                annunciAggiornati++;
                console.log(`✅ Aggiornato: ${annuncio.titolo}`);
              } else {
                console.error(`❌ Errore nell'aggiornamento dell'annuncio ${annuncio.subito_id}:`, await update.text());
              }
            } else {
              // Se non esiste, inserisci un nuovo record
              const insert = await fetch(`${SUPABASE_URL}/rest/v1/moto_listings`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                  'apikey': SUPABASE_API_KEY,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(annuncioData)
              });
              if (insert.ok) {
                nuoviAnnunci++;
                console.log(`✅ Inserito: ${annuncio.titolo}`);
              } else {
                console.error(`❌ Errore nell'inserimento dell'annuncio ${annuncio.subito_id}:`, await insert.text());
              }
            }
          }, 5, 2000); // 5 tentativi, ritardo iniziale di 2 secondi per le operazioni Supabase
        } catch (fetchErr) {
          console.error(`❌ Fallimento definitivo operazione Supabase per "${annuncio.titolo}":`, fetchErr.message);
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
    console.log(`📊 Nuovi annunci inseriti: ${nuoviAnnunci}`);
    console.log(`📊 Annunci aggiornati: ${annunciAggiornati}`);

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
