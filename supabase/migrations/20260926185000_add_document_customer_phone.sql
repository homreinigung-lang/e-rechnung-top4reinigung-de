alter table public.documents
  add column if not exists customer_phone text not null default '';

comment on column public.documents.customer_phone is
  'Phone snapshot for quote/invoice recipient; allows prospect offers without creating a customer first.';
