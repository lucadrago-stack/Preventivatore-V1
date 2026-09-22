-- Flag su riga tipo_riga='posa': mostra "INCLUSA" al posto dell'importo.
-- Eseguire nel SQL Editor di Supabase, poi ricaricare lo schema API se serve.

alter table righe
  add column if not exists posa_inclusa_flag boolean not null default false;

comment on column righe.posa_inclusa_flag is
  'Solo tipo_riga=posa: true = importo mostrato come INCLUSA (prezzo_riga tipicamente 0).';

create index if not exists righe_posa_inclusa_flag_idx
  on righe (preventivo_id)
  where tipo_riga = 'posa' and posa_inclusa_flag = true;
