-- =============================================================================
-- Fix INSERT preventivi per ruolo commerciale
-- =============================================================================
-- Errore: new row violates row-level security policy for table "preventivi"
--
-- Cause tipiche:
-- 1) INSERT senza commerciale_id (null) mentre la policy richiede
--    commerciale_id = commerciale_corrente_id()
-- 2) commerciali.user_id non collegato → commerciale_corrente_id() = null
--
-- Questo script:
-- A) diagnostica il collegamento user ↔ commerciale
-- B) trigger: se commerciale_id è null in INSERT, lo valorizza da
--    commerciale_corrente_id() (difesa lato DB)
-- =============================================================================

-- A) Diagnostica (esegui e controlla i risultati da loggato via SQL Editor
--    oppure confronta auth.users / commerciali a mano)
select
  c.id as commerciale_id,
  c.nome,
  c.email,
  c.ruolo,
  c.attivo,
  c.user_id,
  c.user_id is not null as collegato_auth
from commerciali c
order by c.nome;

-- Verifica helper (deve restituire un id per l'utente corrente se sei
-- autenticato nel SQL Editor con il ruolo giusto; da dashboard spesso
-- gira come postgres e bypassa — usa piuttosto l'app dopo il fix).
-- select auth.uid() as uid, commerciale_corrente_id() as commerciale_id,
--        is_admin() as admin, is_responsabile_sede() as resp;


-- B) Trigger di sicurezza: auto-assegna commerciale_id se mancante
create or replace function public.preventivi_set_commerciale_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.commerciale_id is null then
    new.commerciale_id := commerciale_corrente_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preventivi_set_commerciale_default on preventivi;
create trigger trg_preventivi_set_commerciale_default
  before insert on preventivi
  for each row
  execute function public.preventivi_set_commerciale_default();

-- Nota: il trigger NON permette a un commerciale di inserire preventivi
-- altrui: la policy WITH CHECK resta attiva. Serve solo a riempire null.
