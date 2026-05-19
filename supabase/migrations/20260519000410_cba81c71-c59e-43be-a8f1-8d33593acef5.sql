
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_expense_wise_topup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_wise_transfer_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_salary_credit() FROM PUBLIC, anon, authenticated;
