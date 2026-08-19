-- Day 2: create a free entitlement for every newly registered user.

CREATE OR REPLACE FUNCTION public.create_free_subscription_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_free_subscription_after_signup ON auth.users;
CREATE TRIGGER create_free_subscription_after_signup
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_free_subscription_for_new_user();

REVOKE EXECUTE ON FUNCTION public.create_free_subscription_for_new_user()
    FROM PUBLIC, anon, authenticated;

INSERT INTO public.subscriptions (user_id, plan, status)
SELECT users.id, 'free', 'active'
FROM auth.users AS users
LEFT JOIN public.subscriptions AS subscriptions
    ON subscriptions.user_id = users.id
WHERE subscriptions.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Explicit grants are required in addition to service_role's RLS bypass.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.skin_analysis TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.payment_webhook_events TO service_role;
