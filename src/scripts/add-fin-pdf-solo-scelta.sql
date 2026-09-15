-- Modalità PDF finanziamento: solo l'opzione scelta (niente confronto).
-- Usata quando il commerciale propone un finanziamento già incluso nel prezzo.

alter table preventivi
  add column if not exists fin_pdf_solo_scelta boolean default false;

comment on column preventivi.fin_pdf_solo_scelta is
  'Se true, nel PDF compare solo fin_durata_scelta (niente confronto opzioni).';
