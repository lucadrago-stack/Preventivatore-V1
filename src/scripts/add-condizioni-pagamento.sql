-- Condizioni di pagamento sul preventivo
-- Eseguire nel SQL Editor di Supabase.

alter table preventivi
  add column if not exists condizioni_pagamento_tipo text;

alter table preventivi
  add column if not exists condizioni_pagamento_acconto numeric;

alter table preventivi
  add column if not exists condizioni_pagamento_testo text;

-- Default implicito in app: standard_50_40_10 (+ testo relativo)
comment on column preventivi.condizioni_pagamento_tipo is
  'standard_50_40_10 | finanziamento_totale | finanziamento_parziale | personalizzato';
