-- Regole prezzo BDS (prodotti a prezzo digitato).
-- Esegui nel SQL Editor di Supabase se le colonne non esistono ancora.

alter table prodotti
  add column if not exists regola_prezzo text
    check (regola_prezzo is null or regola_prezzo in ('diretto', 'sconto_listino', 'moltiplicatore'));

alter table prodotti
  add column if not exists regola_valore numeric;

alter table prodotti
  add column if not exists etichetta_prezzo text;

alter table righe
  add column if not exists prezzo_inserito numeric;

alter table righe
  add column if not exists regola_applicata text;

-- Esempi (adatta gli id/nomi ai tuoi prodotti):
-- update prodotti set regola_prezzo = 'sconto_listino', regola_valore = 20,
--   etichetta_prezzo = 'Prezzo listino Gruppo Finestre' where nome ilike '%gruppo finestre%';
-- update prodotti set regola_prezzo = 'moltiplicatore', regola_valore = 2,
--   etichetta_prezzo = 'Costo netto fornitore' where nome ilike '%serramenti altri%';
