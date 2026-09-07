\# TODO Preventivatore — stato al 7 settembre 2026



\## Cantieri aperti da chiudere prima del rilascio



\### 1. Fix posa in opera (URGENTE)

\- Script SQL da eseguire: `src/scripts/add-riga-posa.sql`

\- Aggiunge `parent\_riga\_id`, allarga CHECK su `tipo\_riga` per accettare `'posa'`, crea `config\_sistema`, fa backfill preventivi 7 e 9

\- \*\*DA ESEGUIRE su Supabase SQL Editor\*\*, poi fare Settings → API → Reload schema

\- Verifica: `select tipo\_riga, count(\*) from righe group by tipo\_riga` deve mostrare `posa`

\- Test pratico: creare preventivo nuovo con posa separata → deve creare riga posa automaticamente



\### 2. Descrizioni commerciali prodotti

\- File Excel `Descrizioni\_Prodotti\_BrunoDrago.xlsx` (in Downloads) da compilare

\- Poi generare SQL per popolare `prodotti.descrizione\_cliente`, `opzioni\_vetro`, `opzioni\_colore`, servizi complementari



\### 3. Correzioni PDF (prompt già preparati)

\- Nome file: `Preventivo\_{numero}\_{cognome}\_{data}.pdf` invece dell'UUID

\- Testo tagliato nel banner dispersioni pagina "Il tuo investimento" (word-wrap)

\- Migliorare leggibilità pagina investimento (font più grande, padding)

\- Rimuovere doppia riga "IMPORTO iva di legge esclusa" + "Imponibile"

\- Fix box "Redatto da" nella copertina (icona busta sovrapposta al nome)

\- Nota "Anta a ribalta e microcircolo incluso" nelle note serramenti

\- Tiro al piano: nota "SE PREVISTO" + importo "OMAGGIO"



\### 4. Colori serramenti (interno/esterno/ferramenta)

\- Prompt preparato per sdoppiare colore in interno + esterno + ferramenta (solo serramenti)

\- Include SQL migrazione e logica PDF smart



\### 5. Loghi PNG

\- Placeholder "LOGHI" ancora presente nella pagina prodotti

\- Attendere PNG del logo dal grafico e sostituire



\### 6. Test sistematici (PRIMA del rilascio)

\- 2-3 preventivi reali completi (serramenti + complementi + posa + finanziamento + detrazione)

\- Verificare che ogni numero torni

\- Testare le 4 combinazioni detrazione/finanziamento (sì/no × sì/no)



\### 7. Rilascio ai commerciali per test uso reale



\## Cose rimandate consapevolmente



\- Sezione grafica scheda serramento con icone maniglie/vetri (aspettare feedback commerciali)

\- Tasso zero lungo (36-60) da negoziare con finanziaria (solo se emerge dal riscontro reale)

\- Auth attiva (predisposto ma spento — accendere alla fine)

\- Integrazione col gestionale

\- Riepilogo commessa con margine



\## Da validare esternamente



\- Percentuale detrazione fiscale e massimali → \*\*commercialista\*\* (cambia col tempo, tenere configurabile)

\- Diciture legali del banner finanziamento → \*\*consulente contratti / finanziaria\*\*

\- Clausole condizioni generali (art. 1341/1342) → \*\*legale\*\*, almeno una revisione prima del rilascio



\## Riferimenti tecnici



\- Progetto Supabase: `jrahapeimeqmeqerouzw`

\- Repo GitHub: `lucadrago-stack/Preventivatore-V1`

\- Path locale: `C:\\Users\\luca.drago\\Documents\\preventivatore`

\- Stack: Next.js + TypeScript + Tailwind + Supabase + pdf-lib

\- Template PDF: PNG in `public/pdf-template/`

