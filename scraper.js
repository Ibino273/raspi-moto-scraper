// scraper.js completo con logger, configurazione e correzione data pubblicazione
require('dotenv').config();
const { chromium } = require('playwright');
const winston = require('winston');
const config = require('./config');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY);

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

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
  'Mozilla/5.0 (X11; Linux x86_64)...'
];

const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function parseSubitoDate(input) {
  const months = {
    gen: '01', feb: '02', mar: '03', apr: '04', mag: '05', giu: '06',
    lug: '07', ago: '08', set: '09', ott: '10', nov: '11', dic: '12'
  };
  const now = new Date();

  if (input?.toLowerCase().includes('oggi')) {
    const hourMatch = input.match(/(\d{2}:\d{2})/);
    if (!hourMatch) return null;
    const [hours, minutes] = hourMatch[1].split(':');
    now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return now.toISOString();
  }

  if (input?.toLowerCase().includes('ieri')) {
    const hourMatch = input.match(/(\d{2}:\d{2})/);
    if (!hourMatch) return null;
    now.setDate(now.getDate() - 1);
    const [hours, minutes] = hourMatch[1].split(':');
    now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return now.toISOString();
  }

  const match = input.match(/(\d{1,2}) (\w{3}) (?:all'|alle) (\d{2}:\d{2})/);
  if (!match) return null;
  const [_, day, monthAbbr, time] = match;
  const month = months[monthAbbr];
  if (!month) return null;
  const year = now.getFullYear();
  return `${year}-${month}-${day.padStart(2, '0')}T${time}:00`;
}

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
          const titoloElement = await detailPage.$('h1');
          const titolo = (await titoloElement?.textContent())?.trim();
          logger.info(`Titolo: ${titolo || 'N/A'}`);

          const descrizioneElement = await detailPage.$('p.AdDescription_description__154FP');
          const descrizione = (await descrizioneElement?.textContent())?.trim();
          logger.info(`Descrizione: ${descrizione ? descrizione.substring(0, 100) + '...' : 'N/A'}`);

          const dataElement = await detailPage.$('span.index-module_insertion-date__MU4AZ');
          const dataText = (await dataElement?.textContent())?.trim();
          const data_pubblicazione = parseSubitoDate(dataText);
          logger.info(`Data Inserzione: ${dataText || 'N/A'}`);

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
          const nome_venditore = (await nomeElement?.textContent())?.trim(); // Rinominato per chiarezza nel record
          logger.info(`Nome Venditore: ${nome_venditore || 'N/A'}`);

          const annoElement = await detailPage.$('li:nth-of-type(7) span.feature-list_value__SZDpz');
          const annoText = (await annoElement?.textContent())?.trim();
          const anno = annoText ? parseInt(annoText.replace(/\D/g, '')) : null; // Mantenuto per compatibilità, ma useremo parsedFeatures.immatricolazione
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
            logger.warn("⚠️ Sezione 'main-data' non trovata o vuota.");
          }

          // Prepara il record da inserire nella tabella Supabase
          const record = {
            titolo: titolo || null,
            descrizione: descrizione || null,
            marca: parsedFeatures.marca || null,
            modello: parsedFeatures.modello || null,
            prezzo: prezzoParsed || null,
            anno: parsedFeatures.immatricolazione
              ? parseInt(parsedFeatures.immatricolazione.substring(parsedFeatures.immatricolazione.length - 4))
              : (annoText ? parseInt(annoText.replace(/\D/g, '')) : null), // Fallback se 'immatricolazione' non è presente nelle features
            km: parsedFeatures.km
              ? parseInt(parsedFeatures.km.replace(/\D/g, ''))
              : kilometri,
            likes: likes ? parseInt(likes.replace(/\D/g, '')) : null,
            data_pubblicazione, // Già parsata correttamente
            link_annuncio: fullUrl,
            comune: comune || null,
            nome_venditore: nome_venditore || null,
            cilindrata: cilindrata || null, // Aggiunto il campo cilindrata
            versione: parsedFeatures.versione || null, // Aggiunto il campo versione
            tipo_veicolo: parsedFeatures.tipodiveicolo || null, // Aggiunto il campo tipo_veicolo
            iva_esposta: parsedFeatures.ivaesposta === 'Sì', // Converti in booleano se "Sì"
            created_at: new Date().toISOString(),
          };

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

runScraper().catch(err => logger.error('❌ Unhandled error: ' + err.message));
```
