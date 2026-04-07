-- Payment seed data.
--
-- Late fee rows are created automatically by the return workflow (Camunda).
-- No manual seeding needed — the /api/debug/seed-late-return endpoint creates
-- the rental, and confirming return triggers Camunda to record the late fee.

USE payment_db;
