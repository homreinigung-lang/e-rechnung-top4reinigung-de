REVOKE SELECT ON public.subscriptions FROM anon;
GRANT SELECT (id, company_name, city, sort_order, status, visible_on_landing) ON public.subscriptions TO anon;