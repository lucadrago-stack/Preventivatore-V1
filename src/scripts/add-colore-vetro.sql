-- Colore / vetro su riga + cataloghi opzioni + flag prodotto
-- Eseguire nel SQL Editor di Supabase.

create table if not exists opzioni_colore (
  id serial primary key,
  valore text not null,
  ordine int not null default 0
);

create table if not exists opzioni_vetro (
  id serial primary key,
  valore text not null,
  ordine int not null default 0
);

alter table prodotti
  add column if not exists ha_vetro boolean not null default false;

alter table righe
  add column if not exists colore text;

alter table righe
  add column if not exists vetro text;

-- Esempi (opzionale; commentare se già popolati)
-- insert into opzioni_colore (valore, ordine) values
--   ('Bianco', 10),
--   ('RAL a scelta', 20);
-- insert into opzioni_vetro (valore, ordine) values
--   ('Basso emissivo', 10),
--   ('Selettivo', 20);
