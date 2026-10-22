-- Runs once, on first start with an empty `pgdata` volume.
-- The superuser `drinks` (POSTGRES_USER) owns both databases.
CREATE DATABASE drinks_trade;
CREATE DATABASE drinks_trade_test;
