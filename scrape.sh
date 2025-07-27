#!/bin/bash

# Directory del progetto
PROJECT_DIR=~/moto-scraper
LOG_DIR="$PROJECT_DIR/logs" # Directory per i log
TIMESTAMP=$(date +"%Y%m%d_%H%M%S") # Timestamp per il nome del file di log
LOG_FILE="$LOG_DIR/scrape_$TIMESTAMP.log" # Nome del file di log con timestamp

# Crea la directory dei log se non esiste
mkdir -p "$LOG_DIR" || { echo "❌ Errore: Impossibile creare la directory dei log $LOG_DIR"; exit 1; }

# Funzione per gestire gli errori
handle_error() {
  echo "❌ Errore durante l'esecuzione dello scraper: $1" | tee -a "$LOG_FILE"
  echo "🔴 Fine scraping con errori alle $(date)" | tee -a "$LOG_FILE"
  # Qui si potrebbe aggiungere una logica per inviare notifiche (es. email, Slack)
  exit 1
}

# Spostati nella directory del progetto
cd "$PROJECT_DIR" || handle_error "Impossibile accedere alla directory del progetto $PROJECT_DIR."

echo "🚀 Avvio scraping alle $(date)" | tee -a "$LOG_FILE"

# Esegui lo scraper e reindirizza output e errori al file di log
# Utilizza `set -o pipefail` per catturare errori all'interno della pipe
set -o pipefail
node scraper.js 2>&1 | tee -a "$LOG_FILE"

# Controlla lo stato di uscita dello scraper
if [ ${PIPESTATUS[0]} -eq 0 ]; then
  echo "✅ Fine scraping con successo alle $(date)" | tee -a "$LOG_FILE"
  # Qui si potrebbe aggiungere una logica per inviare notifiche di successo
else
  handle_error "Lo script scraper.js ha terminato con errori. Controlla $LOG_FILE per i dettagli."
fi

# Suggerimento per la rotazione dei log (puoi configurarlo con logrotate)
echo "" | tee -a "$LOG_FILE" # Aggiungi una riga vuota per chiarezza
echo "💡 Per gestire la dimensione dei log, considera di configurare logrotate." | tee -a "$LOG_FILE"
echo "   Esempio di configurazione per logrotate (crea un file /etc/logrotate.d/moto-scraper):" | tee -a "$LOG_FILE"
echo "   $PROJECT_DIR/logs/*.log {" | tee -a "$LOG_FILE"
echo "       daily" | tee -a "$LOG_FILE"
echo "       rotate 7" | tee -a "$LOG_FILE"
echo "       compress" | tee -a "$LOG_FILE"
echo "       missingok" | tee -a "$LOG_FILE"
echo "       notifempty" | tee -a "$LOG_FILE"
echo "       create 0644 root root" | tee -a "$LOG_FILE" # Assicura i permessi corretti
echo "   }" | tee -a "$LOG_FILE"

