#!/bin/bash

echo "🔧 Setup ambiente per Moto Scraper su Raspberry Pi"

# Funzione per gestire gli errori
handle_error() {
  echo "❌ Errore: $1"
  exit 1
}

# Aggiorna e fa l'upgrade dei pacchetti
echo "🔄 Aggiornamento e upgrade dei pacchetti di sistema..."
sudo apt update && sudo apt upgrade -y || handle_error "Impossibile aggiornare i pacchetti."

# Controlla se Node.js è già installato e installa se necessario
if ! command -v node &> /dev/null
then
    echo "🚀 Installazione di Node.js (versione 18.x)..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - || handle_error "Impossibile scaricare lo script di setup di Node.js."
    sudo apt install -y nodejs || handle_error "Impossibile installare Node.js."
else
    echo "✅ Node.js già installato."
fi

# Verifica le versioni di Node.js e npm
node -v && npm -v || handle_error "Node.js o npm non funzionano correttamente."

# Crea la directory del progetto se non esiste
echo "📁 Creazione della directory ~/moto-scraper..."
mkdir -p ~/moto-scraper || handle_error "Impossibile creare la directory moto-scraper."
cd ~/moto-scraper || handle_error "Impossibile accedere alla directory moto-scraper."

# Inizializza il progetto npm se non è già inizializzato
if [ ! -f package.json ]; then
  echo "📦 Inizializzazione del progetto npm..."
  npm init -y || handle_error "Impossibile inizializzare il progetto npm."
else
  echo "✅ Progetto npm già inizializzato."
fi

# Installa le dipendenze
echo "⬇️ Installazione delle dipendenze (playwright, dotenv)..."
npm install playwright dotenv || handle_error "Impossibile installare le dipendenze npm."

# Installa il browser Chromium
echo "🌐 Installazione del browser Chromium per Playwright..."
npx playwright install chromium || handle_error "Impossibile installare Chromium."

echo "✅ Setup completato!"
echo ""
echo "👉 Prossimi passi:"
echo "1. Crea un file '.env' nella directory ~/moto-scraper con le tue credenziali Supabase:"
echo "   SUPABASE_URL=\"il_tuo_url_supabase\""
echo "   SUPABASE_API_KEY=\"la_tua_chiave_api_supabase\""
echo "2. Puoi configurare un job cron per eseguire lo scraping automaticamente (es. ogni giorno alle 3:00 AM):"
echo "   (crontab -l; echo \"0 3 * * * cd ~/moto-scraper && bash scrape.sh\") | crontab -"

