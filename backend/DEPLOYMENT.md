# 🚀 Instrukcja deployment – Spotted Backend (VPS K.pl)

## Problem: `password authentication failed for user`

Ten błąd oznacza, że Node.js próbuje połączyć się z PostgreSQL używając nieprawidłowych danych logowania. Najczęstsze przyczyny:
- Brak pliku `.env` na serwerze
- Nieprawidłowe hasło/użytkownik w `.env`
- Użytkownik PostgreSQL nie istnieje lub nie ma uprawnień

---

## KROK 1 – Połącz się z VPS przez SSH

```bash
ssh root@TWOJ_IP_VPS
# lub jeśli masz nazwę użytkownika:
ssh uzytkownik@TWOJ_IP_VPS
```

---

## KROK 2 – Zainstaluj PostgreSQL i skonfiguruj bazę danych

Skopiuj plik `setup-db.sh` na serwer i uruchom go:

```bash
# Na lokalnym komputerze (w PowerShell lub CMD):
scp backend/setup-db.sh root@TWOJ_IP_VPS:/root/

# Na VPS:
nano /root/setup-db.sh
```

> ⚠️ **WAŻNE:** Przed uruchomieniem zmień linię z hasłem:
> ```bash
> DB_PASSWORD="ZMIEN_TO_NA_SILNE_HASLO"
> ```
> Na przykład: `DB_PASSWORD="Moje$ilneHas1o2024"`

Następnie uruchom skrypt:

```bash
chmod +x /root/setup-db.sh
sudo bash /root/setup-db.sh
```

Skrypt wypisze gotowe dane do `.env` – **zanotuj je!**

---

## KROK 3 – Skopiuj pliki projektu na VPS

```bash
# Na lokalnym komputerze (PowerShell):
# Utwórz katalog na VPS
ssh root@TWOJ_IP_VPS "mkdir -p /var/www/spotted/backend/src"

# Skopiuj pliki backendu
scp backend/src/index.js root@TWOJ_IP_VPS:/var/www/spotted/backend/src/
scp backend/package.json root@TWOJ_IP_VPS:/var/www/spotted/backend/
scp backend/deploy.sh root@TWOJ_IP_VPS:/var/www/spotted/backend/
```

---

## KROK 4 – Utwórz plik .env na VPS

```bash
# Na VPS:
nano /var/www/spotted/backend/.env
```

Wklej (zastępując wartości swoimi danymi ze skryptu setup-db.sh):

```env
PORT=4000
DB_USER=spotted_user
DB_PASSWORD=TWOJE_HASLO_Z_KROKU_2
DB_HOST=localhost
DB_PORT=5432
DB_NAME=spotted
```

Zapisz: `Ctrl+O`, `Enter`, `Ctrl+X`

---

## KROK 5 – Uruchom skrypt deployment'u

```bash
cd /var/www/spotted/backend
chmod +x deploy.sh
sudo bash deploy.sh
```

Skrypt automatycznie:
- Zainstaluje Node.js 20
- Zainstaluje PM2 (process manager)
- Zainstaluje zależności npm
- Uruchomi aplikację i skonfiguruje autostart

---

## KROK 6 – Sprawdź czy działa

```bash
# Sprawdź logi
pm2 logs spotted

# Test health check
curl http://localhost:4000/health
# Powinno zwrócić: {"status":"ok","database":"connected"}

# Sprawdź status procesów
pm2 status
```

---

## 🔧 Rozwiązywanie problemów

### Problem: `password authentication failed`

```bash
# Sprawdź czy użytkownik istnieje w PostgreSQL
sudo -u postgres psql -c "\du"

# Zresetuj hasło użytkownika
sudo -u postgres psql -c "ALTER USER spotted_user WITH PASSWORD 'NOWE_HASLO';"

# Zaktualizuj hasło w .env
nano /var/www/spotted/backend/.env
# Zmień DB_PASSWORD=NOWE_HASLO

# Zrestartuj aplikację
pm2 restart spotted
```

### Problem: `connect ECONNREFUSED 127.0.0.1:5432`

```bash
# PostgreSQL nie działa - sprawdź status
sudo systemctl status postgresql

# Uruchom ręcznie
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Problem: `database "spotted" does not exist`

```bash
sudo -u postgres psql -c "CREATE DATABASE spotted OWNER spotted_user;"
```

### Problem: `role "spotted_user" does not exist`

```bash
sudo -u postgres psql -c "CREATE USER spotted_user WITH PASSWORD 'TWOJE_HASLO';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE spotted TO spotted_user;"
```

### Sprawdź pg_hba.conf (uwierzytelnianie)

```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Upewnij się że jest linia (metoda `md5` lub `scram-sha-256`):
```
host    all             all             127.0.0.1/32            scram-sha-256
```
NIE powinna być `peer` (to działa tylko dla lokalnych procesów systemu).

Po zmianie zrestartuj PostgreSQL:
```bash
sudo systemctl restart postgresql
```

---

## 📋 Przydatne komendy PM2

```bash
pm2 status              # Lista procesów
pm2 logs spotted        # Logi w czasie rzeczywistym
pm2 logs spotted --lines 100  # Ostatnie 100 linii logów
pm2 restart spotted     # Restart aplikacji
pm2 stop spotted        # Zatrzymanie aplikacji
pm2 delete spotted      # Usuń proces z PM2
```

---

## 🌐 Opcjonalnie: Nginx jako reverse proxy (port 80/443)

Jeśli chcesz żeby backend był dostępny na porcie 80 (bez `:4000`):

```bash
apt install -y nginx
nano /etc/nginx/sites-available/spotted
```

Wklej:
```nginx
server {
    listen 80;
    server_name TWOJA_DOMENA_LUB_IP;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/spotted /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```
