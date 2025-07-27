# Moto Scraper per Raspberry Pi

## Contenuto
- `setup.sh` – installa Node.js, Playwright, dipendenze.
- `scrape.sh` – script per scraping e invio dati.
- `scraper.js` – codice Playwright per estrazione annunci e invio Supabase.
- `.env.example` – template configurazione.

## Come usare:
1. Clonare:
   ```
   git clone https://github.com/tuo-username/moto-scraper-pi.git
   ```
2. Configurare `.env`.
3. Eseguire:
   ```
   chmod +x setup.sh scrape.sh
   ./setup.sh
   ./scrape.sh  # per test
   ```
4. Aggiungere cron:
   ```
   crontab -e
   0 7 * * * /home/pi/moto-scraper/scrape.sh
   ```

## Note
- Inserire le tue chiavi Supabase.
- Usa raspbian Lite per risorse minime.
