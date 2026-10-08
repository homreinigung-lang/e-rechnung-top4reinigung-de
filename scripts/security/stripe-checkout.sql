begin;
do $$ begin
 assert not has_table_privilege('anon','public.stripe_checkout_attempts','SELECT'), 'anon reads reservations';
 assert not has_table_privilege('authenticated','public.stripe_checkout_attempts','SELECT'), 'user reads server-only reservations';
 assert not has_table_privilege('authenticated','public.stripe_checkout_attempts','INSERT'), 'user forges reservation';
 assert not has_table_privilege('authenticated','public.stripe_checkout_attempts','UPDATE'), 'user rewrites Checkout parameters';
 assert not has_table_privilege('authenticated','public.stripe_checkout_attempts','DELETE'), 'user removes payment lock';
 assert has_table_privilege('service_role','public.stripe_checkout_attempts','INSERT'), 'server cannot reserve';
end $$;
insert into auth.users(id,email) values ('b1000000-0000-4000-8000-000000000001','checkout@example.invalid');
insert into public.subscriptions(id,user_id,plan,status) values ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','basis','inactive');
insert into public.stripe_checkout_attempts(subscription_id,user_id,billing_mode,input,order_data)
 values ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','sandbox','{"orderNumber":"FIRST"}','{}');
insert into public.stripe_checkout_attempts(subscription_id,user_id,billing_mode,input,order_data)
 values ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','sandbox','{"orderNumber":"CHANGED"}','{}')
 on conflict (subscription_id,billing_mode) do nothing;
do $$ begin
 assert (select count(*) from public.stripe_checkout_attempts where subscription_id='b2000000-0000-4000-8000-000000000001')=1, 'duplicate reservation';
 assert (select input->>'orderNumber' from public.stripe_checkout_attempts where subscription_id='b2000000-0000-4000-8000-000000000001')='FIRST', 'immutable parameters changed';
end $$;
rollback;
