// config.js
module.exports = {
  BASE_URL: 'https://www.subito.it/annunci-piemonte/vendita/moto-e-scooter/',
  MAX_PAGES_TO_SCRAPE: 3, // Numero massimo di pagine da scansionare in modalità debug
  MAX_LISTINGS_PER_PAGE_DEBUG: 2, // Numero massimo di annunci da elaborare per pagina in modalità debug
  MAX_TOTAL_LISTINGS_DEBUG: 6, // Numero massimo totale di annunci da elaborare in modalità debug (2 per pagina * 3 pagine)
  LOG_FILE_PATH: 'scraper.log', // Percorso del file di log
};
