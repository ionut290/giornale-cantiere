# Giornale Cantiere Mobile

App web mobile-first, separata e dedicata alla gestione:
- commesse
- registrazioni giornaliere di cantiere
- allegati foto da fotocamera o galleria

## Funzionalità

- **Elenco commesse** con ricerca rapida e pulsante "Aggiungi commessa"
- Dopo la creazione, ogni commessa apre automaticamente una pagina dedicata con **submenu interno**
- **Submenu commessa**:
  - Panoramica
  - Giornale cantiere
  - Presenze
  - Lavori eseguiti
  - Mezzi e attrezzature
  - Materiali
  - Problemi / anomalie
  - Foto
  - Note finali
- **Giornale cantiere** con inserzioni:
  - collegate alla commessa corretta
  - salvate con timestamp completo
  - ordinate dalla più recente alla più vecchia
  - **raggruppate automaticamente per data**
  - espandibili per vedere tutti i dettagli
- Pulsante **"Foto / Camera"** per scatto diretto o scelta da galleria
- Salvataggio su **database locale browser (IndexedDB)**
- Struttura dati pronta per filtri futuri (data, commessa, operatore)

## Avvio rapido

Apri `index.html` in un browser moderno (su telefono o in emulazione mobile).

## Note tecniche

- UI mobile-first, semplice e veloce
- Architettura separata dalla app principale
- Nessuna dipendenza esterna
