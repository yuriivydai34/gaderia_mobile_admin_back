-- Safe to re-run.
--
--   node scripts/migrate.mjs --remote
--
-- A ready-made set ('kit', migrations/022) is six flavours in one box, but the
-- catalog demanded a flavour of every juice, so each set was stored with one
-- of its six picked at random: "Набір 1" as PEARAPPLE, "Набір 2" as APPLE.
--
-- The app's flavour filter is an exact match on type_juice, so a set turned up
-- under that one flavour as if it were an ordinary juice of it, and under no
-- other - somebody filtering "Яблучно-лимонний" never saw "Набір 1" although
-- lemon juice is in the box.
--
-- The sets stay type_product JUICE: that is what they are, they keep their
-- place under the "Сік" filter, and the app needs no new value to understand
-- them. catalog-input.ts now clears the flavour fields of a kit and stops
-- asking for one.

BEGIN;

UPDATE catalog
SET type_juice = NULL, type_vinegar = NULL, type_apple = NULL
WHERE own_sets_role = 'kit'
  AND (type_juice IS NOT NULL OR type_vinegar IS NOT NULL OR type_apple IS NOT NULL);

COMMIT;

-- Left alone on purpose: the tasting set (id 81 on production) is also a set
-- of flavours carrying one of them, APPLEBERRY. It is not marked 'kit',
-- because that role also hides a product until the by-the-bottle mode is on -
-- marking it now would take it away from every customer. Worth revisiting
-- once own_sets_mode is 'on'.
