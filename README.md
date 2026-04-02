# Giornale Cantiere Mobile

App web mobile-first, separata e dedicata alla gestione:
- commesse
- registrazioni giornaliere di cantiere
- allegati foto da fotocamera o galleria

## Funzionalità

- **Elenco commesse** con ricerca rapida e pulsante "Aggiungi commessa"
- Ogni commessa apre una pagina dedicata con **submenu interno**
- **Giornale cantiere**: inserzioni collegate alla commessa, salvate con timestamp, ordinate e raggruppate per data
- **Annulla reale** nei form (nessun salvataggio involontario)
- Pulsanti rapidi nelle sezioni submenu (Panoramica/Presenze/Mezzi/Materiali/Problemi/Note) per aprire direttamente la compilazione voce
- Nuova sezione **Elenco lavori da eseguire**:
  - creazione lavorazione
  - checkbox "fatto"
  - apertura form completamento con materiali, foto, problemi/anomalie, note finali
  - lavorazione completata mostrata automaticamente in **Lavori eseguiti**
- Pulsante **"Foto / Camera"** per scatto diretto o scelta da galleria
- Salvataggio su **database locale browser (IndexedDB)**

## Avvio rapido

Apri `index.html` in un browser moderno (su telefono o in emulazione mobile).
