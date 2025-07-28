// scraper.js - Versione per Debug (Analizza tutti gli annunci e gestisce la paginazione con click)
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
  let pageNumber = 1;
  const maxPagesToScrape = 5; // Limite massimo di pagine da scansionare per evitare cicli infiniti
  const maxListingsToScrape = 50; // Nuovo limite massimo di annunci da scrapare
  let totalListingsScraped = 0; // Contatore totale annunci scrapati

  try {
    // Avvia il browser Chromium in modalità headless per maggiore velocità
    browser = await chromium.launch({
      headless: true, // Impostato su true per velocizzare
      executablePath: '/usr/bin/chromium-browser',
      args: ['--start-fullscreen']
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    });

    const page = await context.newPage();

    // Naviga alla prima pagina una sola volta all'inizio
    console.log(`🌐 Navigazione alla pagina iniziale: ${BASE_URL}...`);
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log(`✅ Pagina ${pageNumber} caricata: ${BASE_URL}`);
    } catch (navigationError) {
      console.error(`❌ Errore di navigazione alla pagina iniziale:`, navigationError.message);
      return; // Termina se la navigazione fallisce
    }

    // --- Rimosso il blocco di gestione dei cookie ---

    // Rimosso il waitForTimeout(1000) qui per velocizzare

    while (pageNumber <= maxPagesToScrape && totalListingsScraped < maxListingsToScrape) { // Aggiunto controllo sul numero massimo di annunci
      console.log(`\n--- Inizio elaborazione Pagina #${pageNumber} (Annunci totali finora: ${totalListingsScraped}) ---`);

      console.log("--- Tentativo di estrazione annunci dalla pagina principale ---");

      // Estrai tutti i link degli annunci utilizzando il selettore fornito
      const listingLinks = await page.$$('div:nth-of-type(3) a.SmallCard-module_link__hOkzY');
      console.log(`🔍 Trovati ${listingLinks.length} link di annunci con 'div:nth-of-type(3) a.SmallCard-module_link__hOkzY' su questa pagina.`);

      if (listingLinks.length === 0 && pageNumber === 1) {
        console.error("❌ Nessun link di annuncio trovato sulla prima pagina. Il selettore 'div:nth-of-type(3) a.SmallCard-module_link__hOkzY' potrebbe essere sbagliato o la pagina è vuota.");
        break; // Nessun annuncio sulla prima pagina, termina
      } else if (listingLinks.length === 0 && pageNumber > 1) {
        console.log("ℹ️ Nessun annuncio trovato su questa pagina. Fine della paginazione.");
        break; // Nessun annuncio sulle pagine successive, fine della paginazione
      }
      
      let annuncioCountOnPage = 0;
      // Itera su ogni link di annuncio trovato
      for (const linkElement of listingLinks) {
        if (totalListingsScraped >= maxListingsToScrape) { // Controlla il limite prima di elaborare ogni annuncio
          console.log(`🏁 Raggiunto il limite di ${maxListingsToScrape} annunci. Arresto lo scraping.`);
          break; // Esci dal ciclo for se il limite è raggiunto
        }

        annuncioCountOnPage++;
        totalListingsScraped++; // Incrementa il contatore totale
        console.log(`\n--- Elaborazione annuncio #${annuncioCountOnPage} (Pagina ${pageNumber}, Totale: ${totalListingsScraped}) ---`);

        const fullUrl = await linkElement?.getAttribute('href');
        console.log(`Link annuncio: ${fullUrl || 'N/A'}`);

        try {
          if (fullUrl) {
            console.log("--- Tentativo di navigazione alla pagina di dettaglio ---");
            const detailPage = await context.newPage(); // Apre una nuova pagina per il dettaglio
            try {
              await detailPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
              console.log(`✅ Pagina caricata per: ${fullUrl}`);

              // Estrazione dati dalla pagina di dettaglio con i selettori forniti
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
              const kilometri = kilometriText ? parseInt(kilometriText.replace(/\D/g, '')) : null;
              console.log(`Kilometri: ${kilometri || 'N/A'}`);

              const comuneElement = await detailPage.$('p.AdInfo_locationText__rDhKP');
              const comune = (await comuneElement?.textContent())?.trim();
              console.log(`Comune: ${comune || 'N/A'}`);

              const prezzoElement = await detailPage.$('p.AdInfo_price__flXgp');
              const prezzoText = (await prezzoElement?.textContent())?.trim();
              
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
              const anno = annoText ? parseInt(annoText.replace(/\D/g, '')) : null;
              console.log(`Anno: ${anno || 'N/A'}`);

              const cilindrataElement = await detailPage.$('li:nth-of-type(4) span.feature-list_value__SZDpz');
              const cilindrataText = (await cilindrataElement?.textContent())?.trim();
              const cilindrata = cilindrataText ? parseInt(cilindrataText.replace(/\D/g, '')) : null;
              console.log(`Cilindrata: ${cilindrata || 'N/A'}`);

              const likesElement = await detailPage.$('span.Heart_counter-wrapper__number__Xltfo');
              const likes = (await likesElement?.textContent())?.trim();
              console.log(`Likes: ${likes || 'N/A'}`);

              // --- LOGICA PER I "DATI PRINCIPALI" VARIABILI ---
              console.log("--- Estrazione Dati Principali (Marca, Modello, ecc.) ---");
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
                console.log("Dati Principali Parsed:", parsedFeatures);

                console.log(`Marca: ${parsedFeatures.marca || 'N/A'}`);
                console.log(`Modello: ${parsedFeatures.modello || 'N/A'}`);
                console.log(`Anno: ${parsedFeatures.immatricolazione || parsedFeatures.anno || 'N/A'}`);
                console.log(`Km: ${parsedFeatures.km || 'N/A'}`);
                console.log(`Cilindrata: ${parsedFeatures.cilindrata || 'N/A'}`);
                console.log(`Versione: ${parsedFeatures.versione || 'N/A'}`);
                console.log(`Tipo di veicolo: ${parsedFeatures.tipodiveicolo || 'N/A'}`);
                console.log(`Iva esposta: ${parsedFeatures.ivaesposta || 'N/A'}`);
                console.log(`Immatricolazione: ${parsedFeatures.immatricolazione || 'N/A'}`);

              } else {
                console.warn("⚠️ Contenitore 'Dati Principali' (section.main-data) non trovato.");
              }

            } catch (detailPageError) {
              console.error(`❌ Errore durante lo scraping della pagina per "${fullUrl}":`, detailPageError.message);
            } finally {
              await detailPage.close();
            }
          } else {
            console.log("⚠️ Link annuncio non trovato, impossibile visitare la pagina.");
          }

        } catch (itemError) {
          console.error(`❌ Errore durante l'estrazione dei dettagli dall'annuncio ${fullUrl || 'sconosciuto'}:`, itemError.message);
        }
        // Aggiungi un ritardo tra l'elaborazione di un annuncio e il successivo
        await page.waitForTimeout(getRandomDelay(200, 800)); // Ridotto a 0.2-0.8 secondi
      }

      // Se il limite di annunci è stato raggiunto all'interno del ciclo for, usciamo anche dal while
      if (totalListingsScraped >= maxListingsToScrape) {
        console.log(`🏁 Raggiunto il limite di ${maxListingsToScrape} annunci. Arresto lo scraping.`);
        break;
      }

      // --- Logica di Paginazione ---
      console.log(`\n--- Controllo pulsante "Pagina successiva" sulla Pagina ${pageNumber} ---`);
      const nextPageButtonSelector = "[aria-label='Andare alla prossima pagina']";
      const nextPageButton = await page.$(nextPageButtonSelector);

      if (nextPageButton) {
        try {
          // Assicurati che il pulsante sia visibile e abilitato prima di cliccare
          await nextPageButton.waitForElementState('visible', { timeout: 5000 });
          await nextPageButton.waitForElementState('enabled', { timeout: 5000 });

          await nextPageButton.click();
          console.log(`➡️ Cliccato il pulsante "Pagina successiva" per andare alla pagina ${pageNumber + 1}.`);
          pageNumber++; // Incrementa il numero di pagina per la prossima iterazione
          await page.waitForTimeout(getRandomDelay(1000, 3000)); // Attendi il caricamento della nuova pagina (ridotto)
        } catch (clickError) {
          console.warn(`⚠️ Impossibile cliccare il pulsante "Pagina successiva" sulla pagina ${pageNumber}:`, clickError.message);
          console.log("🛑 Fine della paginazione (pulsante non cliccabile o non più disponibile).");
          break; // Interrompi se il pulsante non è cliccabile o scompare
        }
      } else {
        console.log("🛑 Pulsante 'Pagina successiva' non trovato. Fine della paginazione.");
        break; // Interrompi se il pulsante non è trovato
      }
    }

    console.log(`\n--- Debug completato. Totale annunci elaborati: ${totalListingsScraped}. Controlla l'output della console per i risultati. ---`);

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
