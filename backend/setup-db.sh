#!/bin/bash
# ============================================================
# Skrypt konfiguracji PostgreSQL dla projektu "spotted"
# Uruchom na VPS jako root lub użytkownik z sudo:
#   chmod +x setup-db.sh && sudo bash setup-db.sh
# ============================================================

DB_NAME="spotted"
DB_USER="spotted_user"
DB_PASSWORD="ZMIEN_TO_NA_SILNE_HASLO"   # <-- ZMIEŃ TO HASŁO!

echo "========================================"
echo " Konfiguracja PostgreSQL dla 'spotted'"
echo "========================================"

# 1. Sprawdź czy PostgreSQL jest zainstalowany
if ! command -v psql &> /dev/null; then
  echo "[INFO] PostgreSQL nie znaleziony - instaluję..."
  apt update && apt install -y postgresql postgresql-contrib
else
  echo "[OK] PostgreSQL jest zainstalowany: $(psql --version)"
fi

# 2. Upewnij się że serwis działa
systemctl enable postgresql
systemctl start postgresql
echo "[OK] PostgreSQL uruchomiony"

# 3. Utwórz użytkownika i bazę danych
echo "[INFO] Tworzenie użytkownika '$DB_USER' i bazy '$DB_NAME'..."
sudo -u postgres psql <<EOF
-- Usuń jeśli istnieje (przy ponownym uruchomieniu skryptu)
DROP DATABASE IF EXISTS $DB_NAME;
DROP USER IF EXISTS $DB_USER;

-- Utwórz użytkownika z hasłem
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Utwórz bazę danych
CREATE DATABASE $DB_NAME OWNER $DB_USER;

-- Nadaj uprawnienia
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

\echo '[OK] Użytkownik i baza danych utworzone!'
EOF

# 4. Wypisz dane do pliku .env
echo ""
echo "========================================"
echo " GOTOWE! Skopiuj poniższe dane do pliku"
echo " /var/www/spotted/backend/.env"
echo "========================================"
echo ""
echo "PORT=4000"
echo "DB_USER=$DB_USER"
echo "DB_PASSWORD=$DB_PASSWORD"
echo "DB_HOST=localhost"
echo "DB_PORT=5432"
echo "DB_NAME=$DB_NAME"
echo ""
echo "========================================"
echo " Weryfikacja połączenia:"
echo "========================================"
sudo -u postgres psql -c "\l" | grep $DB_NAME
echo ""
echo "[DONE] Konfiguracja zakończona!"
