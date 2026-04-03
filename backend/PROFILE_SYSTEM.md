PROFILE SYSTEM – SPOTTED APP

1. CEL
Zakładka Profil umożliwia:
- zarządzanie danymi użytkownika
- prezentację reputacji (punkty, ranga)
- ustawienie preferencji feedu (Dla Ciebie)

--------------------------------------------------

2. DANE UŻYTKOWNIKA

Tabela users – rozszerzenie:

- avatar_url (STRING)
- first_name (STRING)
- last_name (STRING)
- phone (STRING)
- email (STRING)
- profession (STRING)
- city (STRING)
- country (STRING)

--------------------------------------------------

3. REPUTACJA (WYŚWIETLANIE)

W profilu:

- punkty (points)
- ranga (rank)
- weight (rank_weight)
- skuteczność (% accuracy)

UI:
- pasek progresu do następnej rangi
- badge rangi

--------------------------------------------------

4. AVATAR

Funkcjonalność:
- upload zdjęcia
- zapis w backend/uploads
- zapis URL w avatar_url

Endpoint:
POST /user/avatar

--------------------------------------------------

5. EDYCJA PROFILU

Endpoint:
PUT /user/profile

Pola:
- imię
- nazwisko
- telefon
- email
- zawód
- lokalizacja

--------------------------------------------------

6. PREFERENCJE FEEDU (KLUCZOWE)

Nowa tabela:

user_preferences:
- user_id
- lat
- lng
- radius_km
- use_current_location (BOOLEAN)

Możliwości:
- ustawienie wielu lokalizacji (array)
- ustawienie promienia (np. 5km, 20km, 100km)

--------------------------------------------------

7. INTEGRACJA Z HERE MAPS

Funkcje:

- wybór lokalizacji na mapie
- reverse geocoding
- zapis współrzędnych

Frontend:
- mapa HERE
- pin wyboru lokalizacji

--------------------------------------------------

8. OPCJA: MOJA LOKALIZACJA

Przycisk:
"Pobierz moją lokalizację"

Flow:
- request GPS
- zapis lat/lng
- ustawienie radius

--------------------------------------------------

9. LOGIKA "DLA CIEBIE"

Feed pobiera:

- user_preferences
- filtruje posty po:
  distance(post, user_pref) <= radius

Jeśli wiele lokalizacji:
- OR logic (post pasuje do jednej)

--------------------------------------------------

10. BACKEND – NOWE ENDPOINTY

GET /user/profile
PUT /user/profile
POST /user/avatar

GET /user/preferences
POST /user/preferences
PUT /user/preferences

--------------------------------------------------

11. FRONTEND (PROFILE SCREEN)

Sekcje:

1. Avatar + dane
2. Punkty + ranga
3. Edycja danych
4. Preferencje lokalizacji (mapa)
5. Ustawienia feedu

--------------------------------------------------

12. CECHY

- personalizacja feedu
- budowa tożsamości użytkownika
- integracja z systemem reputacji
- większa kontrola nad treścią

--------------------------------------------------

KONIEC