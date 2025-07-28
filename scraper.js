// scraper.js - Versione per Debug (Paginazione URL Diretta, 2 annunci per pagina, 3 pagine)
require('dotenv').config();
const { chromium } = require('playwright');
const winston = require('winston'); // Importa winston
const config = require('./config'); // Importa la configurazione esterna

// Configurazione del logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`)
  ),
  transports: [
    new winston.transports.Console(), // Logga anche in console
    new winston.transports.File({ filename: config.LOG_FILE_PATH }) // Logga su file
  ],
});

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
      logger.warn(`Tentativo ${i + 1} fallito. Riprovo in ${delay / 1000} secondi...`, error.message);
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
  const BASE_URL = config.BASE_URL; // Caricato da config.js
  const MAX_PAGES_TO_SCRAPE = config.MAX_PAGES_TO_SCRAPE; // Caricato da config.js
  const MAX_LISTINGS_PER_PAGE_DEBUG = config.MAX_LISTINGS_PER_PAGE_DEBUG; // Caricato da config.js
  const MAX_TOTAL_LISTINGS_DEBUG = config.MAX_TOTAL_LISTINGS_DEBUG; // Caricato da config.js
  
  let pageNumber = 1;
  let totalListingsScraped = 0; // Contatore totale annunci scrapati
  let errorsEncountered = 0; // Contatore errori

  try {
    // Avvia il browser Chromium in modalità headless per maggiore velocità
    browser = await chromium.launch({
      headless: true, // Impostato su true per velocizzare, significa che non visualizza
      executablePath: '/usr/bin/chromium-browser',
      args: ['--start-fullscreen']
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    });

    const page = await context.newPage();

    // --- Gestione del riquadro dei cookie (Strategia più robusta con contenitore) ---
    let cookieHandled = false;
    try {
      // Attendi il contenitore del popup dei cookie
      const cookieContainer = await page.waitForSelector('div.didomi-popup-container', { timeout: 7000, state: 'visible' });
      
      if (cookieContainer) {
        logger.info("✅ Cookie: Riquadro cookie rilevato. Tentativo di chiusura...");
        
        // Tentativo 1: Clicca "Continua senza accettare" all'interno del contenitore
        try {
          const continueButton = await cookieContainer.waitForSelector('span.didomi-continue-without-agreeing', { timeout: 3000, state: 'visible' });
          if (continueButton) {
            await continueButton.click();
            logger.info("✅ Cookie: Cliccato 'Continua senza accettare'.");
            cookieHandled = true;
          }
        } catch (err1) {
          logger.warn("⚠️ Cookie: 'Continua senza accettare' non trovato o non cliccabile. Tentativo di accettare...");
        }

        if (!cookieHandled) {
          // Tentativo 2: Clicca "Accetta" all'interno del contenitore
          try {
            const acceptButton = await cookieContainer.waitForSelector('button:has-text("Accetta")', { timeout: 3000, state: 'visible' });
            if (acceptButton) {
              await acceptButton.click();
              logger.info("✅ Cookie: Cliccato 'Accetta'.");
              cookieHandled = true;
            }
          } catch (err2) {
            logger.warn("⚠️ Cookie: 'Accetta' non trovato o non cliccabile. Tentativo di chiudere via JS...");
          }
        }
      } else {
        logger.info("ℹ️ Cookie: Riquadro cookie non rilevato dopo l'attesa iniziale.");
        cookieHandled = true; // Se non c'è il container, consideriamo gestito
      }
    } catch (containerErr) {
      logger.info("⚠️ Cookie: Contenitore principale dei cookie non apparso. Continuo lo scraping...");
      cookieHandled = false; // Non è stato gestito tramite click
    }

    if (!cookieHandled) {
      try {
        // Tentativo 3: Rimuovi l'overlay dei cookie via JavaScript
        await page.evaluate(() => {
          const dialog = document.querySelector('.didomi-popup-open'); // Classe comune per il body quando il popup è aperto
          if (dialog) {
            dialog.style.overflow = 'auto'; // Ripristina lo scroll
          }
          const cookieBanner = document.getElementById('didomi-host'); // ID comune del banner
          if (cookieBanner) {
            cookieBanner.remove();
          }
          const cookieOverlay = document.querySelector('.didomi-popup-backdrop'); // Selettore per l'overlay
          if (cookieOverlay) {
            cookieOverlay.remove();
          }
          // Potrebbe esserci anche un elemento che blocca lo scroll del body
          document.body.style.overflow = 'auto'; 
        });
        logger.info("✅ Cookie: Rimosso l'overlay via JavaScript.");
        cookieHandled = true;
      } catch (err3) {
        logger.error("❌ Cookie: Errore durante la rimozione dell'overlay via JavaScript:", err3.message);
        errorsEncountered++;
      }
    }

    if (!cookieHandled) {
      logger.warn("⚠️ Cookie: Impossibile gestire la finestra dei cookie. Potrebbe bloccare lo scraping.");
    }
    // --- Fine gestione cookie ---

    // Ciclo principale per la paginazione
    while (pageNumber <= MAX_PAGES_TO_SCRAPE && totalListingsScraped < MAX_TOTAL_LISTINGS_DEBUG) {
      const currentPageUrl = pageNumber === 1 ? BASE_URL : `${BASE_URL}?o=${pageNumber}`;
      logger.info(`🌐 Navigazione alla pagina ${pageNumber}: ${currentPageUrl}...`);
      
      try {
        await page.goto(currentPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        logger.info(`✅ Pagina ${pageNumber} caricata: ${currentPageUrl}`);
      } catch (navigationError) {
        logger.error(`❌ Errore di navigazione alla pagina ${pageNumber}:`, navigationError.message);
        errorsEncountered++;
        pageNumber++; // Prova la prossima pagina anche in caso di errore di navigazione
        continue; // Passa alla prossima iterazione del ciclo while
      }

      logger.info(`\n--- Inizio elaborazione Pagina #${pageNumber} (Annunci totali finora: ${totalListingsScraped}) ---`);
      logger.info("--- Tentativo di estrazione annunci dalla pagina principale ---");

      // Estrai tutti i link degli annunci utilizzando il selettore fornito
      const listingLinks = await page.$$('div:nth-of-type(3) a.SmallCard-module_link__hOkzY');
      logger.info(`🔍 Trovati ${listingLinks.length} link di annunci con 'div:nth-of-type(3) a.SmallCard-module_link__hOkzY' su questa pagina.`);

      if (listingLinks.length === 0) {
        logger.info("ℹ️ Nessun annuncio trovato su questa pagina. Fine della paginazione o pagina vuota.");
        break; // Nessun annuncio, termina la paginazione
      }
      
      let annuncioCountOnPage = 0;
      // Itera su ogni link di annuncio trovato, limitando a `MAX_LISTINGS_PER_PAGE_DEBUG`
      for (const linkElement of listingLinks) {
        if (annuncioCountOnPage >= MAX_LISTINGS_PER_PAGE_DEBUG || totalListingsScraped >= MAX_TOTAL_LISTINGS_DEBUG) {
          logger.info(`🏁 Raggiunto il limite di ${MAX_LISTINGS_PER_PAGE_DEBUG} annunci per pagina o il limite totale di ${MAX_TOTAL_LISTINGS_DEBUG}. Arresto l'elaborazione degli annunci su questa pagina.`);
          break; // Esci dal ciclo for se il limite per pagina o il limite totale è raggiunto
        }

        annuncioCountOnPage++;
        totalListingsScraped++; // Incrementa il contatore totale
        logger.info(`\n--- Elaborazione annuncio #${annuncioCountOnPage} (Pagina ${pageNumber}, Totale: ${totalListingsScraped}) ---`);

        const fullUrl = await linkElement?.getAttribute('href');
        logger.info(`Link annuncio: ${fullUrl || 'N/A'}`);

        try {
          if (fullUrl) {
            logger.info("--- Tentativo di navigazione alla pagina di dettaglio ---");
            const detailPage = await context.newPage(); // Apre una nuova pagina per il dettaglio
            try {
              await detailPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
              logger.info(`✅ Pagina caricata per: ${fullUrl}`);

              // Estrazione dati dalla pagina di dettaglio con i selettori forniti
              const titoloElement = await detailPage.$('h1');
              const titolo = (await titoloElement?.textContent())?.trim();
              logger.info(`Titolo: ${titolo || 'N/A'}`);

              const descrizioneElement = await detailPage.$('p.AdDescription_description__154FP');
              const descrizione = (await descrizioneElement?.textContent())?.trim();
              logger.info(`Descrizione: ${descrizione ? descrizione.substring(0, 100) + '...' : 'N/A'}`);

              const dataElement = await detailPage.$('span.index-module_insertion-date__MU4AZ');
              const data = (await dataElement?.textContent())?.trim();
              logger.info(`Data Inserzione: ${data || 'N/A'}`);

              const kilometriElement = await detailPage.$('li:nth-of-type(6) span.feature-list_value__SZDpz');
              const kilometriText = (await kilometriElement?.textContent())?.trim();
              const kilometri = kilometriText ? parseInt(kilometriText.replace(/\D/g, '')) : null;
              logger.info(`Kilometri: ${kilometri || 'N/A'}`);

              const comuneElement = await detailPage.$('p.AdInfo_locationText__rDhKP');
              const comune = (await comuneElement?.textContent())?.trim();
              logger.info(`Comune: ${comune || 'N/A'}`);

              const prezzoElement = await detailPage.$('p.AdInfo_price__flXgp');
              const prezzoText = (await prezzoElement?.textContent())?.trim();
              
              let prezzoParsed = null;
              if (prezzoText) {
                  const cleanedPrice = prezzoText.replace(/€|\s/g, '').replace(/\./g, '').replace(',', '.');
                  prezzoParsed = parseFloat(cleanedPrice);
              }
              logger.info(`Prezzo: ${prezzoParsed || 'N/A'}`);

              const nomeElement = await detailPage.$('.PrivateUserProfileBadge_small__lEJuK .headline-6 a');
              const nome = (await nomeElement?.textContent())?.trim();
              logger.info(`Nome Venditore: ${nome || 'N/A'}`);

              const annoElement = await detailPage.$('li:nth-of-type(7) span.feature-list_value__SZDpz');
              const annoText = (await annoElement?.textContent())?.trim();
              const anno = annoText ? parseInt(annoText.replace(/\D/g, '')) : null;
              logger.info(`Anno: ${anno || 'N/A'}`);

              const cilindrataElement = await detailPage.$('li:nth-of-type(4) span.feature-list_value__SZDpz');
              const cilindrataText = (await cilindrataElement?.textContent())?.trim();
              const cilindrata = cilindrataText ? parseInt(cilindrataText.replace(/\D/g, '')) : null;
              logger.info(`Cilindrata: ${cilindrata || 'N/A'}`);

              const likesElement = await detailPage.$('span.Heart_counter-wrapper__number__Xltfo');
              const likes = (await likesElement?.textContent())?.trim();
              logger.info(`Likes: ${likes || 'N/A'}`);

              // --- LOGICA PER I "DATI PRINCIPALI" VARIABILI ---
              logger.info("--- Estrazione Dati Principali (Marca, Modello, ecc.) ---");
              const mainDataSection = await detailPage.$('section.main-data');

              const parsedFeatures = {};

              if (mainDataSection) {
                const featureItems = await mainDataSection.$$('li.feature-list_feature__gAyqB');
                for (const item of featureItems) {
                  const labelElement = await item.$('span:first-child');
                  const valueElement = await item.$('span.feature-list_value__SZDpz');

                  const label = (await labelElement?.textContent())?.trim();
                  const value = (await valueElement?.textContent())?.trim();

                  if (label && value) {
                    const normalizedLabel = label.toLowerCase().replace(/\s/g, '');
                    parsedFeatures[normalizedLabel] = value;
                  }
                }
                logger.info("Dati Principali Parsed:", parsedFeatures);

                logger.info(`Marca: ${parsedFeatures.marca || 'N/A'}`);
                logger.info(`Modello: ${parsedFeatures.modello || 'N/A'}`);
                logger.info(`Anno: ${parsedFeatures.immatricolazione || parsedFeatures.anno || 'N/A'}`);
                logger.info(`Km: ${parsedFeatures.km || 'N/A'}`);
                logger.info(`Cilindrata: ${parsedFeatures.cilindrata || 'N/A'}`);
                logger.info(`Versione: ${parsedFeatures.versione || 'N/A'}`);
                logger.info(`Tipo di veicolo: ${parsedFeatures.tipodiveicolo || 'N/A'}`);
                logger.info(`Iva esposta: ${parsedFeatures.ivaesposta || 'N/A'}`);
                logger.info(`Immatricolazione: ${parsedFeatures.immatricolazione || 'N/A'}`);

              } else {
                logger.warn("⚠️ Contenitore 'Dati Principali' (section.main-data) non trovato.");
              }

            } catch (detailPageError) {
              logger.error(`❌ Errore durante lo scraping della pagina per "${fullUrl}":`, detailPageError.message);
              errorsEncountered++;
            } finally {
              await detailPage.close();
            }
          } else {
            logger.warn("⚠️ Link annuncio non trovato, impossibile visitare la pagina.");
          }

        } catch (itemError) {
          logger.error(`❌ Errore durante l'estrazione dei dettagli dall'annuncio ${fullUrl || 'sconosciuto'}:`, itemError.slice(0, 100) + '...'); // Tronca il messaggio di errore
          errorsEncountered++;
        }
        // Add a delay between processing each ad
        await page.waitForTimeout(getRandomDelay(200, 800)); // Reduced to 0.2-0.8 seconds
      }

      pageNumber++; // Passa alla prossima pagina
    }

    logger.info(`\n--- Debug completato. ---`);
    logger.info(`📊 Report Finale:`);
    logger.info(`   - Annunci totali elaborati: ${totalListingsScraped}`);
    logger.info(`   - Errori riscontrati: ${errorsEncountered}`);

  } catch (err) {
    logger.error('❌ Errore critico nello scraper di debug:', err.message);
    errorsEncountered++; // Conta anche gli errori critici
  } finally {
    if (browser) {
      await browser.close();
      logger.info('🚪 Browser chiuso.');
    }
  }
}

// Esegui lo scraper di debug
runScraperDebug().catch(err => logger.error('❌ Unhandled error:', err));
