// scraper.js - Versione per Debug (Analizza tutti gli annunci sulla prima pagina)
require('dotenv').config();
const { chromium } = require('playwright');

// Nota: SUPABASE_URL e SUPABASE_API_KEY non sono usati in questa versione di debug.
// Le variabili d'ambiente sono ancora caricate, ma non attivamente utilizzate per le operazioni di DB.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// Funzione per implementare la logica di retry per operazioni fallite (non usata in questa versione di debug)
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

async function runScraperDebug() {
  let browser;
  const BASE_URL = 'https://www.subito.it/annunci-piemonte/vendita/moto-e-scooter/';

  try {
    // Avvia il browser Chromium in modalità non headless per vedere cosa succede
    browser = await chromium.launch({
      headless: false, // Impostato su false per visualizzare il browser
      executablePath: '/usr/bin/chromium-browser',
      args: ['--start-fullscreen']
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    });

    const page = await context.newPage();
    console.log(`🌐 Navigazione a ${BASE_URL}...`);

    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log(`✅ Pagina caricata: ${BASE_URL}`);
    } catch (navigationError) {
      console.error(`❌ Errore di navigazione:`, navigationError.message);
      return; // Termina se la navigazione fallisce
    }

    // --- Rimosso il blocco di gestione dei cookie come richiesto ---

    // Attendi un attimo per assicurarti che la pagina sia completamente renderizzata
    await page.waitForTimeout(3000); // 3 secondi di attesa

    console.log("--- Tentativo di estrazione annunci dalla pagina principale ---");

    // Estrai tutti i link degli annunci utilizzando il selettore fornito
    const listingLinks = await page.$$('div:nth-of-type(3) a.SmallCard-module_link__hOkzY');
    console.log(`🔍 Trovati ${listingLinks.length} link di annunci con 'div:nth-of-type(3) a.SmallCard-module_link__hOkzY'.`);

    if (listingLinks.length === 0) {
      console.error("❌ Nessun link di annuncio trovato. Il selettore 'div:nth-of-type(3) a.SmallCard-module_link__hOkzY' potrebbe essere sbagliato o la pagina è vuota.");
    } else {
      let annuncioCount = 0;
      // Itera su ogni link di annuncio trovato
      for (const linkElement of listingLinks) {
        annuncioCount++;
        console.log(`\n--- Elaborazione annuncio #${annuncioCount} ---`);

        const fullUrl = await linkElement?.getAttribute('href');
        console.log(`Link annuncio: ${fullUrl || 'N/A'}`);

        try {
          // --- Rimossa la raccolta dati di Titolo, Prezzo e Immagine dalla pagina principale come richiesto ---
          // Questi dati verranno raccolti dalla pagina di dettaglio.

          if (fullUrl) {
            console.log("--- Tentativo di navigazione alla pagina di dettaglio ---");
            const detailPage = await context.newPage(); // Apre una nuova pagina per il dettaglio
            try {
              await detailPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
              console.log(`✅ Pagina caricata per: ${fullUrl}`); // Usa fullUrl qui, il titolo sarà estratto dopo

              // Estrazione dati dalla pagina di dettaglio con i NUOVI selettori forniti
              // Nuovo selettore per Titolo (h1)
              const titoloElement = await detailPage.$('h1');
              const titolo = (await titoloElement?.textContent())?.trim();
              console.log(`Titolo: ${titolo || 'N/A'}`);

              const descrizioneElement = await detailPage.$('p.AdDescription_description__154FP');
              const descrizione = (await descrizioneElement?.textContent())?.trim();
              console.log(`Descrizione: ${descrizione ? descrizione.substring(0, 100) + '...' : 'N/A'}`);

              const dataElement = await detailPage.$('span.index-module_insertion-date__MU4AZ');
              const data = (await dataElement?.textContent())?.trim();
              console.log(`Data Inserzione: ${data || 'N/A'}`);

              const kilometriElement = await detailPage.$('li:nth-of-type(6) span.feature-list_value__SZDpz');
              const kilometriText = (await kilometriElement?.textContent())?.trim();
              const kilometri = kilometriText ? parseInt(kilometriText.replace(/\D/g, '')) : null; // Pulisce e converte in numero
              console.log(`Kilometri: ${kilometri || 'N/A'}`);

              const comuneElement = await detailPage.$('p.AdInfo_locationText__rDhKP');
              const comune = (await comuneElement?.textContent())?.trim();
              console.log(`Comune: ${comune || 'N/A'}`);

              const prezzoElement = await detailPage.$('p.AdInfo_price__flXgp');
              const prezzoText = (await prezzoElement?.textContent())?.trim();
              
              // CORREZIONE: Gestione del prezzo per formato italiano anche per il dettaglio
              let prezzoParsed = null;
              if (prezzoText) {
                  const cleanedPrice = prezzoText.replace(/€|\s/g, '').replace(/\./g, '').replace(',', '.');
                  prezzoParsed = parseFloat(cleanedPrice);
              }
              console.log(`Prezzo: ${prezzoParsed || 'N/A'}`);

              const nomeElement = await detailPage.$('.PrivateUserProfileBadge_small__lEJuK .headline-6 a');
              const nome = (await nomeElement?.textContent())?.trim();
              console.log(`Nome Venditore: ${nome || 'N/A'}`);

              const annoElement = await detailPage.$('li:nth-of-type(7) span.feature-list_value__SZDpz');
              const annoText = (await annoElement?.textContent())?.trim();
              const anno = annoText ? parseInt(annoText.replace(/\D/g, '')) : null; // Pulisce e converte in numero
              console.log(`Anno: ${anno || 'N/A'}`);

              const cilindrataElement = await detailPage.$('li:nth-of-type(4) span.feature-list_value__SZDpz');
              const cilindrataText = (await cilindrataElement?.textContent())?.trim();
              const cilindrata = cilindrataText ? parseInt(cilindrataText.replace(/\D/g, '')) : null; // Pulisce e converte in numero
              console.log(`Cilindrata: ${cilindrata || 'N/A'}`);

              // Selettori di Marca e Modello già presenti
              const marcaElement = await detailPage.$('li:nth-of-type(1) span.feature-list_value__SZDpz');
              const marca = (await marcaElement?.textContent())?.trim();
              console.log(`Marca: ${marca || 'N/A'}`);

              const modelloElement = await detailPage.$('li:nth-of-type(2) span.feature-list_value__SZDpz');
              const modello = (await modelloElement?.textContent())?.trim();
              console.log(`Modello: ${modello || 'N/A'}`);

              const likesElement = await detailPage.$('span.Heart_counter-wrapper__number__Xltfo');
              const likes = (await likesElement?.textContent())?.trim();
              console.log(`Likes: ${likes || 'N/A'}`);


            } catch (detailPageError) {
              console.error(`❌ Errore durante lo scraping della pagina per "${fullUrl}":`, detailPageError.message);
            } finally {
              await detailPage.close(); // Chiude la pagina di dettaglio
            }
          } else {
            console.log("⚠️ Link annuncio non trovato, impossibile visitare la pagina.");
          }

        } catch (itemError) {
          console.error(`❌ Errore durante l'estrazione dei dettagli dall'annuncio ${fullUrl || 'sconosciuto'}:`, itemError.message);
        }
        // Aggiungi un ritardo tra l'elaborazione di un annuncio e il successivo
        await page.waitForTimeout(getRandomDelay(1000, 3000));
      }
    }

    console.log("\n--- Debug completato. Controlla l'output della console per i risultati. ---");

  } catch (err) {
    console.error('❌ Errore critico nello scraper di debug:', err.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🚪 Browser chiuso.');
    }
  }
}

// Esegui lo scraper di debug
runScraperDebug().catch(err => console.error('❌ Errore non gestito:', err));
