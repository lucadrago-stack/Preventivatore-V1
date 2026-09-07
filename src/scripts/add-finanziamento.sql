-- Configurazione finanziamento (parametri aggiornabili senza toccare il codice)
create table if not exists config_finanziamento (
  chiave text primary key,
  valore numeric not null,
  descrizione text
);

insert into config_finanziamento (chiave, valore, descrizione) values
  ('soglia_tasso_zero_gratis', 5000, 'Sotto questa soglia (IVATO) il tasso zero non applica maggiorazione'),
  ('limite_finanziabile_20mesi', 9500, 'Massimo finanziabile a tasso zero (20 mesi)'),
  ('maggiorazione_perc', 3.5, 'Percentuale di maggiorazione sul prezzo fatturato'),
  ('istruttoria', 400, 'Costo istruttoria aggiunto all''importo finanziato'),
  ('costo_dealer_perc', 2.5, 'Costo dealer % sull''importo finanziato (margine interno)'),
  ('detrazione_perc', 50, 'Percentuale detrazione fiscale sul imponibile (pagina investimento PDF)')
on conflict (chiave) do nothing;

-- Convenzioni / durate offerte
create table if not exists convenzioni_finanziamento (
  id serial primary key,
  durata_mesi integer not null,
  tan numeric not null default 0,
  tipo text not null check (tipo in ('tasso_zero', 'rate_lunghe')),
  regola_maggiorazione text not null
    check (regola_maggiorazione in ('mai', 'sempre', 'sopra_soglia')),
  attivo boolean not null default true,
  ordine integer not null default 0,
  etichetta text
);

insert into convenzioni_finanziamento
  (durata_mesi, tan, tipo, regola_maggiorazione, attivo, ordine, etichetta)
select * from (values
  (20, 0::numeric, 'tasso_zero', 'sopra_soglia', true, 1, '20 mesi tasso zero'),
  (36, 7.5::numeric, 'rate_lunghe', 'sempre', true, 2, '36 mesi'),
  (48, 7.9::numeric, 'rate_lunghe', 'sempre', true, 3, '48 mesi'),
  (60, 8.2::numeric, 'rate_lunghe', 'sempre', true, 4, '60 mesi')
) as v(durata_mesi, tan, tipo, regola_maggiorazione, attivo, ordine, etichetta)
where not exists (select 1 from convenzioni_finanziamento limit 1);

-- Colonne sul preventivo per salvare simulazione e scelta
alter table preventivi
  add column if not exists finanziamento_attivo boolean default false;

alter table preventivi
  add column if not exists finanziamento_anticipo numeric default 0;

alter table preventivi
  add column if not exists finanziamento_durate_mostrate text;

alter table preventivi
  add column if not exists fin_durata_scelta integer;

alter table preventivi
  add column if not exists fin_importo_fatturato numeric;

alter table preventivi
  add column if not exists fin_importo_finanziato numeric;

alter table preventivi
  add column if not exists fin_rata numeric;

alter table preventivi
  add column if not exists fin_tan numeric;

alter table preventivi
  add column if not exists fin_famiglia text;

alter table preventivi
  add column if not exists detrazione_perc numeric default 50;

-- Famiglie / doppio piano: vedi anche add-finanziamento-famiglie.sql
