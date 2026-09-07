-- Colori serramenti: interno / esterno / ferramenta
alter table righe
  add column if not exists colore_interno text;

alter table righe
  add column if not exists colore_esterno text;

alter table righe
  add column if not exists colore_ferramenta text;
