-- Tabella rubrica clienti
create table if not exists clienti (
  id serial primary key,
  nome text not null,
  cantiere text,
  telefono text,
  email text,
  created_at timestamptz default now()
);

-- Collegamento opzionale preventivo → cliente
alter table preventivi
  add column if not exists cliente_id integer references clienti(id);

-- Popola clienti da preventivi esistenti (deduplicando per nome)
insert into clienti (nome, cantiere, telefono, email)
select distinct on (lower(trim(cliente_nome)))
  trim(cliente_nome),
  trim(cliente_cantiere),
  trim(cliente_telefono),
  trim(cliente_email)
from preventivi
where cliente_nome is not null and trim(cliente_nome) <> ''
order by lower(trim(cliente_nome)), created_at desc
on conflict do nothing;

-- Collega preventivi esistenti ai clienti appena creati
update preventivi p
set cliente_id = c.id
from clienti c
where lower(trim(p.cliente_nome)) = lower(trim(c.nome))
  and p.cliente_id is null;
