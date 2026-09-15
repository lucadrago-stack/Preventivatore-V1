-- Assorbi maggiorazione finanziamento: importo contratto = Totale IVATO (niente +3,5%).
-- Usata quando il commerciale chiude includendo il finanziamento nel prezzo.

alter table preventivi
  add column if not exists fin_assorbi_maggiorazione boolean default false;

comment on column preventivi.fin_assorbi_maggiorazione is
  'Se true, il calcolo finanziamento non applica la maggiorazione (contratto = base IVATO).';
