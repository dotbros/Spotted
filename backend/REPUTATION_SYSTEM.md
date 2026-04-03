REPUTATION SYSTEM – SPOTTED APP

1. CEL SYSTEMU
System ma nagradzać użytkowników za trafne informacje oraz karać za dezinformację.
System opiera się na:
- punktach (points)
- rangach (rank)
- wadze głosu (rank_weight)
- rozliczeniu po 12 godzinach

--------------------------------------------------

2. CYKL ŻYCIA POSTA

- Post aktywny: 12 godzin
- Po 12h:
  - obliczany jest wynik prawdziwości (truth_score)
  - użytkownicy są rozliczani

truth_score = true_weight / (true_weight + false_weight)

Status:
- >= 0.65 → TRUE
- <= 0.35 → FALSE
- 0.35–0.65 → UNRESOLVED

--------------------------------------------------

3. PUNKTY – ETAP NATYCHMIASTOWY

Za udział w głosowaniu:

BASE_VOTE = +10

BONUSY:
- zdjęcie: +20
- lokalizacja zgodna: +30

SZYBKOŚĆ REAKCJI:
- <= 5 min: +40
- <= 30 min: +25
- <= 2h: +10
- > 2h: +0

MAX: 100 pkt za jedną akcję

--------------------------------------------------

4. ROZLICZENIE PO 12H

JEŚLI TRAFIONY GŁOS:
+50 pkt (ACCURACY_REWARD)

JEŚLI BŁĘDNY GŁOS:
-150 pkt (kara podstawowa)
- cofnięcie punktów za:
  - głos
  - zdjęcie
  - lokalizację

Przykład:
Użytkownik zdobył 80 pkt → może stracić nawet 230 pkt

--------------------------------------------------

5. SYSTEM ANTY-TROLL (BANKRUT REPUTACJI)

Warunek:
- punkty < -200 LUB
- skuteczność < 30% przy min. 20 głosach

Efekt:
- blokada na 30 dni:
  - brak głosowania
  - brak publikacji

Dodatkowo:
- reset rangi do najniższej
- weight minimalny

--------------------------------------------------

6. RANGI I WAGI

Tabela rang:

NIEZAREJSTROWANY
- weight: 0.1

NOWY
- punkty: 0–100
- weight: 1.0

CZŁONEK
- punkty: 100–500
- weight: 1.2

WERYFIKATOR
- punkty: 500–1500
- weight: 1.5

REPORTER
- punkty: 1500–5000
- weight: 2.0

EKSPERT
- punkty: 5000+
- weight: 3.0

--------------------------------------------------

7. ALTERNATYWNA FORMUŁA WAGI (dynamiczna)

rank_weight = 1 + log10(points / 100 + 1)

Zapewnia:
- brak ekstremalnych przewag
- stabilny wzrost wpływu

--------------------------------------------------

8. LICZENIE GŁOSÓW

Zamiast:
true_votes++

Używamy:
true_weight += user.rank_weight

--------------------------------------------------

9. OCHRONA SYSTEMU

- min. liczba głosów: 10
- min. suma wag: 15
- inaczej → UNRESOLVED

--------------------------------------------------

10. METRYKI UŻYTKOWNIKA

- total_points
- correct_votes
- incorrect_votes
- accuracy_percent

accuracy = correct / total_votes

--------------------------------------------------

11. DEGRADACJA PUNKTÓW (ANTI-INACTIVITY)

Punkty użytkownika nie są wieczne.

Dodajemy mechanizm utraty punktów za brak aktywności:

Nowa kolumna w users:
- last_login_at (TIMESTAMP)

Zasady:
- jeśli użytkownik nie loguje się przez 7 dni:
  - traci 5% swoich punktów dziennie
- maksymalna utrata: do 50% punktów

Przykład:
- 1000 pkt
- brak logowania 10 dni
→ -5% dziennie → ok. 500 pkt po 10 dniach

Cel:
- utrzymanie aktywnej społeczności
- zapobieganie „martwym ekspertom”

--------------------------------------------------

12. ZMIANY W BAZIE DANYCH

Tabela users – nowe kolumny:

- points (INT)
- rank (STRING)
- rank_weight (FLOAT)
- correct_votes (INT)
- incorrect_votes (INT)
- last_login_at (TIMESTAMP)
- reputation_locked_until (TIMESTAMP) // ban 30 dni

Tabela posts – nowe kolumny:

- evaluation_deadline (TIMESTAMP)
- final_truth_score (FLOAT)
- final_status (STRING)
- evaluation_processed (BOOLEAN)

Tabela votes – nowe kolumny:

- vote_weight (FLOAT)
- points_awarded_initial (INT)
- points_corrected (INT)
- evaluated (BOOLEAN)

--------------------------------------------------

13. CRON – SYSTEM AUTOMATYCZNY

Potrzebne 2 zadania:

1. Co 1 minuta:
- rozliczanie postów po 12h

2. Co 24h:
- sprawdzanie nieaktywnych użytkowników
- odejmowanie punktów
- aktualizacja rank_weight

--------------------------------------------------

14. CECHY SYSTEMU

- promuje prawdę
- eliminuje trolli
- nagradza szybkość i obecność na miejscu
- wzmacnia wiarygodnych użytkowników
- wymusza aktywność użytkowników

--------------------------------------------------

15. DODATKOWE PUNKTY ZA WERYFIKACJĘ

- uzupełnienie imienia (+5pkt)
- uzupełnienie nazwiska (+5pkt)
- uzupełnienie numeru telefonu (+50pkt)
- uzupełnienie zawodu (+15pkt)
- uzupełnienie miasta (+15pkt)
- uzupełnienie kraju (+5pkt)
- uzupełnienie domyślnej lokalizacji (+200pkt)

--------------------------------------------------

KONIEC
