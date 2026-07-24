-- 0010_fun_allocations.sql
-- Optional per-transaction fun-budget split. JSON array of {person, amount} allocations that
-- refines the fun overlay for partial/split spend; absent means the existing whole-amount
-- fun/person attribution applies unchanged.
ALTER TABLE transactions ADD COLUMN fun_allocations TEXT;
