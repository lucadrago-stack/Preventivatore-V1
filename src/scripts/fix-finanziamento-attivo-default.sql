-- Default: includi finanziamento nel preventivo
alter table preventivi
  alter column finanziamento_attivo set default true;

-- Allinea preventivi già creati con il vecchio default false
-- e senza simulazione effettivamente configurata.
update preventivi
set finanziamento_attivo = true
where finanziamento_attivo is distinct from true
  and fin_durata_scelta is null
  and coalesce(finanziamento_anticipo, 0) = 0
  and (
    finanziamento_durate_mostrate is null
    or trim(finanziamento_durate_mostrate) = ''
  );
