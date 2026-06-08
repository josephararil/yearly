ALTER TABLE transactions ADD COLUMN revolut_category TEXT;
ALTER TABLE transactions ADD COLUMN merchant_mcc      TEXT;
ALTER TABLE transactions ADD COLUMN merchant_city     TEXT;
ALTER TABLE transactions ADD COLUMN merchant_country  TEXT;
ALTER TABLE transactions ADD COLUMN merchant_logo     TEXT;
ALTER TABLE transactions ADD COLUMN card_label        TEXT;
ALTER TABLE transactions ADD COLUMN tx_type           TEXT;
ALTER TABLE transactions ADD COLUMN e_commerce        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN fee_eur           REAL;
