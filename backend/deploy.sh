#!/bin/bash
# ============================================================
# Skrypt deployment aplikacji "spotted" na VPS (K.pl / Ubuntu)
# Uruchom jako root lub użytkownik z sudo:
#   chmod +x deploy.sh && sudo bash deploy.sh
# ============================================================

APP_DIR="/var/www/spotted/backend"
NODE_VERSION="20"

echo "========================================"
echo "  Deployment 'spotted' backend - START"
echo "========================================"

# 1. Aktualizacja systemu i instalacja zależności
echo "[1/6] Aktualizacja pakietów..."
apt update -y && apt upgrade -y

# 2. Instalacja Node.js (jeśli nie ma)
if ! command -v node &> /dev/null; then
  echo "[2/6] Instalacja Node.js $NODE_VERSION..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt install -y nodejs
else
  echo "[2/6] Node.js: $(node --version) - już zainstalowany"
fi

# 3. Instalacja PM2 (process manager - utrzymuje aplikację działającą)
if ! command -v pm2 &> /dev/null; then
  echo "[3/6] Instalacja PM2..."
  npm install -g pm2
else
  echo "[3/6] PM2: $(pm2 --version) - już zainstalowany"
fi

# 4. Instalacja PostgreSQL (jeśli nie ma)
if ! command -v psql &> /dev/null; then
  echo "[4/6] Instalacja PostgreSQL..."
  apt install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
else
  echo "[4/6] PostgreSQL: $(psql --version) - już zainstalowany"
  systemctl start postgresql || true
fi

# 5. Przejdź do katalogu aplikacji
echo "[5/6] Konfiguracja aplikacji..."
cd "$APP_DIR" || { echo "BŁĄD: Katalog $APP_DIR nie istnieje!"; echo "Skopiuj pliki projektu do $APP_DIR i uruchom ponownie."; exit 1; }

# Sprawdź czy .env istnieje
if [ ! -f ".env" ]; then
  echo "BŁĄD: Brak pliku .env w $APP_DIR"
  echo "Utwórz go na podstawie .env.example i uzupełnij dane!"
  echo ""
  echo "Minimalna zawartość .env:"
  echo "  PORT=4000"
  echo "  DB_USER=spotted_user"
  echo "  DB_PASSWORD=TWOJE_HASLO"
  echo "  DB_HOST=localhost"
  echo "  DB_PORT=5432"
  echo "  DB_NAME=spotted"
  exit 1
fi

# Instalacja zależności npm
echo "Instalacja zależności npm..."
npm install --production

# 6. Uruchom/zrestartuj aplikację przez PM2
echo "[6/6] Uruchamianie aplikacji przez PM2..."
pm2 describe spotted > /dev/null 2>&1
if [ $? -eq 0 ]; then
  pm2 restart spotted
  echo "Aplikacja zrestartowana"
else
  pm2 start src/index.js --name "spotted" --time
  echo "Aplikacja uruchomiona"
fi

# Zapisz konfigurację PM2 (autostart po restarcie VPS)
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup

echo ""
echo "========================================"
echo "  Deployment zakończony pomyślnie!"
echo "========================================"
echo ""
echo "Przydatne komendy:"
echo "  pm2 logs spotted        - logi aplikacji"
echo "  pm2 status              - status procesów"
echo "  pm2 restart spotted     - restart aplikacji"
echo "  curl localhost:4000/health - test połączenia"
echo ""
