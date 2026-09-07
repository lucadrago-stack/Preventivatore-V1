-- Estensione famiglie + doppio piano (eseguire dopo add-finanziamento.sql)
-- L'utente può aver già aggiunto queste colonne a mano: IF NOT EXISTS è sicuro.

alter table convenzioni_finanziamento
  add column if not exists doppio_piano boolean not null default false;

alter table convenzioni_finanziamento
  add column if not exists tan_prima_meta numeric;

alter table convenzioni_finanziamento
  add column if not exists famiglia text;

-- Backfill convenzioni esistenti
update convenzioni_finanziamento
set famiglia = 'base'
where famiglia is null and durata_mesi = 20;

update convenzioni_finanziamento
set famiglia = 'tasso_zero'
where famiglia is null and durata_mesi in (36, 48, 60);

update convenzioni_finanziamento
set famiglia = 'doppio_piano'
where famiglia is null and doppio_piano = true;

-- Seed doppio piano (60/96/120) se assenti — TAN da aggiornare in tabella
insert into convenzioni_finanziamento
  (durata_mesi, tan, tan_prima_meta, tipo, regola_maggiorazione, doppio_piano, famiglia, attivo, ordine, etichetta)
select * from (values
  (60, 8.5::numeric, 4.5::numeric, 'rate_lunghe', 'mai', true, 'doppio_piano', true, 10, '60 mesi doppio piano'),
  (96, 8.9::numeric, 4.9::numeric, 'rate_lunghe', 'mai', true, 'doppio_piano', true, 11, '96 mesi doppio piano'),
  (120, 9.2::numeric, 5.2::numeric, 'rate_lunghe', 'mai', true, 'doppio_piano', true, 12, '120 mesi doppio piano')
) as v(durata_mesi, tan, tan_prima_meta, tipo, regola_maggiorazione, doppio_piano, famiglia, attivo, ordine, etichetta)
where not exists (
  select 1 from convenzioni_finanziamento c
  where c.famiglia = 'doppio_piano' and c.durata_mesi = v.durata_mesi
);

alter table preventivi
  add column if not exists fin_famiglia text;
