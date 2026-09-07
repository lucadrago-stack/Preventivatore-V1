-- Totali preventivo: IVA, sconto a cascata, netto target
-- Eseguire nel SQL Editor di Supabase.
alter table preventivi add column if not exists iva_percentuale numeric default 10;
alter table preventivi add column if not exists prezzo_netto_target numeric;
alter table preventivi add column if not exists sconto_percentuale_2 numeric default 0;
