-- Misure griglia in mm (prodotti regola_prezzo = 'griglia')
-- tipologia_apertura, extra_colore_nome, extra_colore_percentuale esistono già.

alter table righe add column if not exists larghezza_mm int;
alter table righe add column if not exists altezza_mm int;
