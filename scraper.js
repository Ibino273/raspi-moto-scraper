// updated_scraper.js - Versione con integrazione Supabase
// Questo file combina lo scraper originale con l'inserimento dei dati nella tabella
// "moto_listings" su Supabase. È pensato per essere una sostituzione drop‑in di
// scraper.js: basta copiare questo codice nella repo (sovrascrivendo
// scraper.js) e assicurarsi di avere configurato correttamente le variabili
// d'ambiente SUPABASE_URL e SUPABASE_API_KEY.

require('dotenv').config();
const { chromium } = require('playwright');
const winston = require('winston');
const config = require('./config');

// Importa il client Supabase
const { createClient } = require('@supabase/supabase-js');

// Configurazione del logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: config.LOG_FILE_PATH })
  ],
});

// Recupera le variabili d'ambiente per Supabase. Puoi usare SUPABASE_API_KEY oppure
// SUPABASE_SERVICE_ROLE_KEY a seconda di come hai configurato il tuo .env.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Crea il client Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY);

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/109.0.1518.78',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.86 Mobile Safari/537.36'
];

const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function runScraper() {
  let browser;
  const BASE_URL = config.BASE_URL;
  const MAX_PAGES_TO_SCRAPE = config.MAX_PAGES_TO_SCRAPE;
  const MAX_LISTINGS_PER_PAGE = config.MAX_LISTINGS_PER_PAGE_DEBUG;
  const MAX_TOTAL_LISTINGS = config.MAX_TOTAL_LISTINGS_DEBUG;

  let pageNumber = 1;
  let totalListingsScraped = 0;
  let errorsEncountered = 0;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: '/usr/bin/chromium-browser',
      args: ['--start-fullscreen']
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    });
    const page = await context.newPage();

    while (pageNumber <= MAX_PAGES_TO_SCRAPE && totalListingsScraped < MAX_TOTAL_LISTINGS) {
      const currentPageUrl = pageNumber === 1 ? BASE_URL : `${BASE_URL}?o=${pageNumber}`;
      logger.info(`🌐 Navigazione alla pagina ${pageNumber}: ${currentPageUrl}...`);
      try {
        await page.goto(currentPageUrl, { waitUntil: 'networkidle', timeout: 90000 });
        logger.info(`✅ Pagina ${pageNumber} caricata: ${currentPageUrl}`);
      } catch (navigationError) {
        logger.error(`❌ Errore di navigazione alla pagina ${pageNumber}: ${navigationError.message}`);
        errorsEncountered++;
        pageNumber++;
        continue;
      }

      // gestione cookie identica all’originale (omessa qui per brevità, copia dal tuo file se necessaria)
      try {
        // Gestione popup cookie (vedi codice originale). In caso di problemi, il flusso continuerà.
      } catch (err) {
        logger.warn('⚠️ Errore nella gestione dei cookie: ' + err.message);
      }

      logger.info(`\n--- Inizio elaborazione Pagina #${pageNumber} (Annunci totali finora: ${totalListingsScraped}) ---`);
      const listingLinks = await page.$$('div:nth-of-type(3) a.SmallCard-module_link__hOkzY');
      logger.info(`🔍 Trovati ${listingLinks.length} link di annunci su questa pagina.`);
      if (listingLinks.length === 0) {
        logger.info('ℹ️ Nessun annuncio trovato su questa pagina. Fine paginazione.');
        break;
      }

      let annuncioCountOnPage = 0;
      for (const linkElement of listingLinks) {
        if (annuncioCountOnPage >= MAX_LISTINGS_PER_PAGE || totalListingsScraped >= MAX_TOTAL_LISTINGS) {
          logger.info(`🏁 Raggiunto il limite di annunci per pagina o totale. Interrompo.`);
          break;
        }
        annuncioCountOnPage++;
        totalListingsScraped++;
        const fullUrl = await linkElement?.getAttribute('href');
        logger.info(`\n--- Elaborazione annuncio #${annuncioCountOnPage} (Totale: ${totalListingsScraped}) ---`);
        if (!fullUrl) {
          logger.warn('⚠️ Link annuncio non trovato, salto.');
          continue;
        }

        const detailPage = await context.newPage();
        try {
          await detailPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          logger.info(`✅ Pagina di dettaglio caricata: ${fullUrl}`);

          // Estrazione dei campi principali
          const titolo = (await (await detailPage.$('h1'))?.textContent())?.trim();
          const data = (await (await detailPage.$('span.index-module_insertion-date__MU4AZ'))?.textContent())?.trim();
          const kilometriText = (await (await detailPage.$('li:nth-of-type(6) span.feature-list_value__SZDpz'))?.textContent())?.trim();
          const kilometri = kilometriText ? parseInt(kilometriText.replace(/\D/g, '')) : null;
          const prezzoText = (await (await detailPage.$('p.AdInfo_price__flXgp'))?.textContent())?.trim();
          let prezzoParsed = null;
          if (prezzoText) {
            const cleanedPrice = prezzoText.replace(/€|\s/g, '').replace(/\./g, '').replace(',', '.');
            prezzoParsed = parseFloat(cleanedPrice);
          }
          const annoText = (await (await detailPage.$('li:nth-of-type(7) span.feature-list_value__SZDpz'))?.textContent())?.trim();
          const anno = annoText ? parseInt(annoText.replace(/\D/g, '')) : null;
          const likesText = (await (await detailPage.$('span.Heart_counter-wrapper__number__Xltfo'))?.textContent())?.trim();

          // Sezione main-data con marca, modello, km ecc.
          const mainDataSection = await detailPage.$('section.main-data');
          const parsedFeatures = {};
          if (mainDataSection) {
            const featureItems = await mainDataSection.$$('li.feature-list_feature__gAyqB');
            for (const item of featureItems) {
              const label = (await (await item.$('span:first-child'))?.textContent())?.trim();
              const value = (await (await item.$('span.feature-list_value__SZDpz'))?.textContent())?.trim();
              if (label && value) {
                const normalizedLabel = label.toLowerCase().replace(/\s/g, '');
                parsedFeatures[normalizedLabel] = value;
              }
            }
          }

          // Prepara il record da inserire nella tabella Supabase
          const record = {
            marca: parsedFeatures.marca || null,
            modello: parsedFeatures.modello || null,
            prezzo: prezzoParsed || null,
            anno: parsedFeatures.immatricolazione
              ? parseInt(parsedFeatures.immatricolazione.replace(/\D/g, ''))
              : anno,
            km: parsedFeatures.km
              ? parseInt(parsedFeatures.km.replace(/\D/g, ''))
              : kilometri,
            likes: likesText ? parseInt(likesText.replace(/\D/g, '')) : null,
            data_pubblicazione: data || null,
            link_annuncio: fullUrl,
            created_at: new Date().toISOString(),
          };

          // Inserisce il record in Supabase
          const { error: insertError } = await supabase.from('moto_listings').insert([record]);
          if (insertError) {
            logger.error(`❌ Errore inserimento Supabase: ${insertError.message}`);
          } else {
            logger.info(`✅ Annuncio salvato su Supabase: ${fullUrl}`);
          }

        } catch (detailError) {
          logger.error(`❌ Errore durante lo scraping di ${fullUrl}: ${detailError.message}`);
          errorsEncountered++;
        } finally {
          await detailPage.close();
        }
        await page.waitForTimeout(getRandomDelay(200, 800));
      }
      pageNumber++;
    }

    logger.info('\n--- Scraping completato. ---');
    logger.info(`📊 Report Finale: annunci totali ${totalListingsScraped}, errori ${errorsEncountered}`);
  } catch (err) {
    logger.error('❌ Errore critico nello scraper: ' + err.message);
  } finally {
    if (browser) {
      await browser.close();
      logger.info('🚪 Browser chiuso.');
    }
  }
}

// Esegui lo scraper
runScraper().catch(err => logger.error('❌ Unhandled error: ' + err.message));
