# Spotted – Git & Development Workflow

## ✅ Repozytorium
Projekt znajduje się na GitHub:
https://github.com/dotbros/Spotted

---

# 🔥 Codzienny workflow pracy

## ✅ Zapisywanie zmian

Po wprowadzeniu zmian w kodzie:

```
git add .
git commit -m "Opis zmian"
git push
```

Przykład:

```
git add .
git commit -m "Dodano lokalny config API"
git push
```

---

# ✅ Praca na drugim komputerze

1. Zainstaluj:
   - Git
   - Node.js
   - Android Studio (jeśli pracujesz nad mobile)

2. Sklonuj projekt:

```
git clone https://github.com/dotbros/Spotted.git
cd Spotted
```

3. Zainstaluj zależności:

Backend:
```
cd backend
npm install
```

Mobile:
```
cd mobile
npm install
```

---

# ✅ Development (lokalnie)

## Backend:
```
cd backend
npm start
```

Backend działa na:
```
http://localhost:4000
```

## Mobile (emulator Android):
```
cd mobile
npx expo start
```

W emulatorze Android:
```
10.0.2.2 = localhost komputera
```

---

# ✅ Struktura środowisk

Development:
- Backend lokalnie
- Baza lokalnie
- Emulator Android
- Expo start

Production:
- Backend na VPS
- Baza na serwerze
- Build release APK

---

# ✅ Zasady profesjonalne

✔ Nie pracujemy bezpośrednio na OneDrive  
✔ Projekt trzymamy lokalnie (np. C:\projekty)  
✔ GitHub służy do synchronizacji  
✔ Nie commitujemy:
  - node_modules
  - android/build
  - .env
  - .gradle

---

# ✅ Bezpieczeństwo

Pliki .env nie są wysyłane na GitHub.
Każdy komputer powinien mieć własny plik .env lokalnie.

---

# 🚀 Następne możliwe kroki

- Wprowadzenie branch develop
- Automatyczne buildy (CI/CD)
- Deployment backendu na VPS
- Wersjonowanie aplikacji mobilnej

---

Autor: Spotted Project