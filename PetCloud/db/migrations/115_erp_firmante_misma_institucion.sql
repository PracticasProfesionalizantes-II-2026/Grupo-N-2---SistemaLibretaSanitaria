-- ============================================================================
-- PetCloud ERP — Migración 115: el que firma el asiento trabaja en la
-- veterinaria del asiento
--
-- LO QUE ESTÁ ROTO
--
-- Once claves foráneas del schema `erp` apuntan a `public.vet_professionals(id)`
-- sin comprobar que ese profesional pertenezca a la institución del movimiento:
--
--   erp.stock_movements     created_by, voided_by              (101)
--   erp.purchases           created_by                          (105)
--   erp.cash_movements      created_by, voided_by              (106)
--   erp.account_movements   created_by, voided_by              (107)
--   erp.sales               created_by                          (108)
--   erp.module_grants       professional_id, granted_by, revoked_by (111)
--
-- Una FK se valida como dueño de la tabla, **ignorando RLS**, así que acepta la
-- fila padre de cualquiera. Resultado: se puede firmar una venta, un movimiento
-- de caja o una anulación a nombre de un profesional de otra veterinaria, y —el
-- caso más feo— darle a un profesional ajeno un permiso de módulo sobre una
-- institución que no es la suya (`module_grants.professional_id`).
--
-- Es exactamente la familia de defecto que cerró la 112 puertas adentro del
-- ERP. Quedaron afuera de aquel barrido **por estructura, no por olvido**:
-- `erp.fks_internas()` filtra por `confrelid IN (tablas de erp)`, así que una FK
-- cuyo destino vive en `public` le es invisible. El test de invariantes está en
-- verde y estas once están abiertas — que es justamente el modo de falla contra
-- el que esa prueba fue escrita. Por eso esta migración no solo arregla las
-- claves: **extiende la red** (bloque 3).
--
-- POR QUÉ HACEN FALTA DOS MIGRACIONES
--
-- Una FK compuesta exige una restricción única sobre exactamente esas columnas
-- en el padre, y el padre vive en `public`. Esa restricción la agrega la **057**,
-- que va en la serie `0xx` porque las migraciones corren en orden lexicográfico
-- y la `1xx` entera corre después: en un `db reset` limpio, una `057` que
-- tocara `erp` se aplicaría antes de que la 100 cree el schema. El corte no es
-- de territorio, lo impone Postgres.
--
-- Si esta migración falla con «there is no unique constraint matching given
-- keys for referenced table "vet_professionals"», falta aplicar la 057.
--
-- ----------------------------------------------------------------------------
-- LA TRAMPA: `ON DELETE SET NULL` compuesto anula TODAS las columnas
-- ----------------------------------------------------------------------------
--
-- Ocho de las once son `ON DELETE SET NULL`. En su versión de una sola columna
-- eso anula `created_by` y listo. En la versión compuesta `(created_by,
-- institution_id)`, el `SET NULL` clásico anula **las dos** — incluida
-- `institution_id`, que es `NOT NULL` en las seis tablas. Borrar la cuenta de
-- un veterinario que alguna vez firmó algo fallaría con violación de NOT NULL,
-- y nos llevaríamos puesto el borrado de cuentas, igual que la 023 se llevó
-- puesto el borrado de mascotas con un CHECK.
--
-- La salida es sintaxis de Postgres 15 y acá corremos **17.6** (verificado
-- contra el stack local): `ON DELETE SET NULL (created_by)` con lista explícita
-- de columnas anula solo esa. Sin ese paréntesis, esta migración es un bug.
--
-- `module_grants.professional_id` no tiene este problema: es `ON DELETE CASCADE`
-- y `NOT NULL`, y la cascada se lleva la fila entera. Conserva su CASCADE.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ NO HACE FALTA BACKFILL, Y POR QUÉ NO USAMOS `MATCH FULL`
-- ----------------------------------------------------------------------------
--
-- Con el `MATCH SIMPLE` que Postgres usa por defecto, si **alguna** columna de
-- la FK es NULL la restricción ni se evalúa. Las filas históricas cuyo firmante
-- ya se borró —`created_by IS NULL`, `institution_id` presente— pasan sin
-- tocarse. Eso es lo que hace innecesario cualquier backfill.
--
-- `MATCH FULL` haría justamente lo contrario: exigiría que las dos columnas
-- sean NULL o ninguna, y rechazaría todas esas filas históricas. No lo usamos, y
-- no es un descuido.
--
-- ----------------------------------------------------------------------------
-- EFECTO DE BORDE QUE HAY QUE CONOCER: mudar un profesional de institución
-- ----------------------------------------------------------------------------
--
-- Sin cláusula `ON UPDATE`, el default es `NO ACTION`: cambiar el
-- `institution_id` de un profesional que ya firmó movimientos será rechazado.
-- Hoy no rompe nada —no existe ninguna ruta en la aplicación que mude a un
-- profesional de veterinaria (verificado)— y la semántica es la correcta: un
-- asiento firmado no se reatribuye solo porque su autor se cambió de clínica.
-- Si mañana hace falta esa mudanza, es una decisión de producto con su propia
-- migración, no un `ON UPDATE CASCADE` puesto al pasar.
--
-- ----------------------------------------------------------------------------
-- ANTES DE APLICAR (manual, del maintainer)
-- ----------------------------------------------------------------------------
--
-- Las once consultas de pre-vuelo del bloque 0 deben dar CERO **en producción**.
-- Si alguna devuelve filas, esas filas son evidencia de que el agujero se usó:
-- se revisan a conciencia, no se deja que `ADD CONSTRAINT` decida por nosotros.
--
-- En local dieron cero, pero eso prueba menos de lo que parece y conviene
-- decirlo: de las 976 filas del ERP local, **ninguna** tiene `created_by` o
-- `voided_by` cargado, y `module_grants` está vacía. El pre-vuelo local es
-- vacuo. El que cuenta es el de producción.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0 · PRE-VUELO (no ejecuta nada: se corre a mano antes de aplicar)
--
--   SELECT 'stock_movements.created_by', count(*) FROM erp.stock_movements m
--     JOIN public.vet_professionals p ON p.id = m.created_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'stock_movements.voided_by', count(*) FROM erp.stock_movements m
--     JOIN public.vet_professionals p ON p.id = m.voided_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'purchases.created_by', count(*) FROM erp.purchases m
--     JOIN public.vet_professionals p ON p.id = m.created_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'cash_movements.created_by', count(*) FROM erp.cash_movements m
--     JOIN public.vet_professionals p ON p.id = m.created_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'cash_movements.voided_by', count(*) FROM erp.cash_movements m
--     JOIN public.vet_professionals p ON p.id = m.voided_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'account_movements.created_by', count(*) FROM erp.account_movements m
--     JOIN public.vet_professionals p ON p.id = m.created_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'account_movements.voided_by', count(*) FROM erp.account_movements m
--     JOIN public.vet_professionals p ON p.id = m.voided_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'sales.created_by', count(*) FROM erp.sales m
--     JOIN public.vet_professionals p ON p.id = m.created_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'module_grants.professional_id', count(*) FROM erp.module_grants m
--     JOIN public.vet_professionals p ON p.id = m.professional_id
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'module_grants.granted_by', count(*) FROM erp.module_grants m
--     JOIN public.vet_professionals p ON p.id = m.granted_by
--    WHERE p.institution_id <> m.institution_id
--   UNION ALL SELECT 'module_grants.revoked_by', count(*) FROM erp.module_grants m
--     JOIN public.vet_professionals p ON p.id = m.revoked_by
--    WHERE p.institution_id <> m.institution_id;
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1 · Dropear las once simples, resueltas por definición y no por nombre
--
-- Los nombres actuales (`sales_created_by_fkey`, etc.) los puso Postgres. Son
-- deterministas en el caso feliz, pero un `_fkey1` por colisión, o un entorno
-- donde alguien renombró algo a mano, convierten un literal escrito acá en un
-- deploy frenado sobre un archivo que es append-only. Ya nos pasó con el CHECK
-- anónimo de la 023, y la 051 tuvo que resolverlo con un bloque DO.
--
-- Así que se busca por lo que la restricción ES —una FK de esta tabla, sobre
-- exactamente esta columna, hacia `public.vet_professionals`— y se exige que
-- haya **exactamente una**. Cero significa que la 115 ya corrió o que el
-- esquema no es el que creemos; más de una, que hay algo que esta migración no
-- entiende. En los dos casos frena en vez de adivinar.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_par RECORD;
  v_nombre TEXT;
  v_cuantas INT;
BEGIN
  FOR v_par IN
    SELECT * FROM (VALUES
      ('erp.stock_movements',   'created_by'),
      ('erp.stock_movements',   'voided_by'),
      ('erp.purchases',         'created_by'),
      ('erp.cash_movements',    'created_by'),
      ('erp.cash_movements',    'voided_by'),
      ('erp.account_movements', 'created_by'),
      ('erp.account_movements', 'voided_by'),
      ('erp.sales',             'created_by'),
      ('erp.module_grants',     'professional_id'),
      ('erp.module_grants',     'granted_by'),
      ('erp.module_grants',     'revoked_by')
    ) AS t(tabla, columna)
  LOOP
    SELECT count(*), min(c.conname)
      INTO v_cuantas, v_nombre
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.conrelid = v_par.tabla::regclass
       AND c.confrelid = 'public.vet_professionals'::regclass
       AND c.conkey = ARRAY[(
             SELECT a.attnum FROM pg_attribute a
              WHERE a.attrelid = v_par.tabla::regclass
                AND a.attname = v_par.columna
                AND NOT a.attisdropped
           )]::smallint[];

    IF v_cuantas <> 1 THEN
      RAISE EXCEPTION
        'Migración 115: se esperaba exactamente 1 FK simple de %.% hacia public.vet_professionals y se encontraron %. Revisar el esquema a mano antes de seguir.',
        v_par.tabla, v_par.columna, v_cuantas;
    END IF;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_par.tabla, v_nombre);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2 · Las once compuestas
--
-- Nombres explícitos y no generados, por la misma razón que en la 112: el
-- mensaje de error que reciba quien intente cruzar instituciones tiene que
-- decirle qué regla rompió. `..._same_institution_fkey` lo dice.
--
-- El `(columna)` del `SET NULL` es la parte que no se puede olvidar. Ver el
-- encabezado.
-- ----------------------------------------------------------------------------
ALTER TABLE erp.stock_movements
  ADD CONSTRAINT stock_movements_created_by_same_institution_fkey
  FOREIGN KEY (created_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (created_by),
  ADD CONSTRAINT stock_movements_voided_by_same_institution_fkey
  FOREIGN KEY (voided_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (voided_by);

ALTER TABLE erp.purchases
  ADD CONSTRAINT purchases_created_by_same_institution_fkey
  FOREIGN KEY (created_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (created_by);

ALTER TABLE erp.cash_movements
  ADD CONSTRAINT cash_movements_created_by_same_institution_fkey
  FOREIGN KEY (created_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (created_by),
  ADD CONSTRAINT cash_movements_voided_by_same_institution_fkey
  FOREIGN KEY (voided_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (voided_by);

ALTER TABLE erp.account_movements
  ADD CONSTRAINT account_movements_created_by_same_institution_fkey
  FOREIGN KEY (created_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (created_by),
  ADD CONSTRAINT account_movements_voided_by_same_institution_fkey
  FOREIGN KEY (voided_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (voided_by);

ALTER TABLE erp.sales
  ADD CONSTRAINT sales_created_by_same_institution_fkey
  FOREIGN KEY (created_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (created_by);

-- `professional_id` es NOT NULL y conserva su CASCADE: si el profesional se
-- borra, su permiso de módulo no tiene sentido y se va con él.
ALTER TABLE erp.module_grants
  ADD CONSTRAINT module_grants_professional_same_institution_fkey
  FOREIGN KEY (professional_id, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE CASCADE,
  ADD CONSTRAINT module_grants_granted_by_same_institution_fkey
  FOREIGN KEY (granted_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (granted_by),
  ADD CONSTRAINT module_grants_revoked_by_same_institution_fkey
  FOREIGN KEY (revoked_by, institution_id)
  REFERENCES public.vet_professionals(id, institution_id)
  ON DELETE SET NULL (revoked_by);

-- Los índices simples sobre `created_by` / `voided_by` de las migraciones
-- originales siguen sirviendo: Postgres puede usar el índice de la primera
-- columna de la FK para el barrido del `SET NULL`. No se agregan compuestos.

-- ----------------------------------------------------------------------------
-- 3 · Extender la red: `erp.fks_hacia_public()`
--
-- `erp.fks_internas()` (112) no ve estas once y no se toca: su contrato —"FK
-- entre dos tablas de erp"— es correcto y tiene su propio test. Lo que faltaba
-- era la otra mitad, y va en una función aparte en vez de ensanchar aquella,
-- para que ninguno de los dos tests cambie de significado.
--
-- Mismo criterio estructural que la 112: el filtro pide que **ambas** tablas
-- tengan `institution_id`, así que las FK hacia catálogos globales de `public`
-- quedan afuera solas, sin lista de excepciones que alguien tenga que mantener.
--
-- Y devuelve TODAS, no solo las infractoras, por la misma razón que allá: una
-- función que solo devuelve infractoras pasa en verde tanto con el esquema sano
-- como con la consulta rota devolviendo nada.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.fks_hacia_public()
RETURNS TABLE (nombre TEXT, tabla TEXT, destino TEXT, columnas TEXT, es_compuesta BOOLEAN)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, erp AS $$
  SELECT c.conname::TEXT,
         c.conrelid::regclass::TEXT,
         c.confrelid::regclass::TEXT,
         (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
            FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a
              ON a.attrelid = c.conrelid AND a.attnum = k.attnum),
         array_length(c.conkey, 1) >= 2
    FROM pg_constraint c
   WHERE c.connamespace = 'erp'::regnamespace
     AND c.contype = 'f'
     AND c.confrelid IN (
           SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
         )
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.conrelid
                    AND a.attname = 'institution_id' AND NOT a.attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.confrelid
                    AND a.attname = 'institution_id' AND NOT a.attisdropped);
$$;

COMMENT ON FUNCTION erp.fks_hacia_public() IS
  'Toda FK del schema erp hacia una tabla de public que lleva institution_id, '
  'con el dato de si es compuesta. Ninguna puede tener es_compuesta = false: '
  'cada una de esas deja firmar un asiento a nombre de alguien de otra '
  'veterinaria. La ejercita tests/rls/erp-schema-invariantes.test.ts. Es la '
  'mitad que erp.fks_internas() (112) no ve, y por la que estas once claves '
  'sobrevivieron a aquel barrido.';

REVOKE EXECUTE ON FUNCTION erp.fks_hacia_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fks_hacia_public() TO service_role;

-- ROLLBACK
-- Las migraciones son append-only: volver atrás es una 116, nunca una edición
-- de este archivo. El contenido de esa 116 sería, en este orden:
--
-- 1 · Dropear las once compuestas por su nombre explícito (acá sí se pueden
--     escribir literales, porque los pusimos nosotros):
--
--     ALTER TABLE erp.stock_movements
--       DROP CONSTRAINT stock_movements_created_by_same_institution_fkey,
--       DROP CONSTRAINT stock_movements_voided_by_same_institution_fkey;
--     -- (ídem purchases, cash_movements, account_movements, sales, module_grants)
--
-- 2 · Recrear las once simples con el ON DELETE original:
--
--     ALTER TABLE erp.stock_movements
--       ADD FOREIGN KEY (created_by) REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
--       ADD FOREIGN KEY (voided_by)  REFERENCES public.vet_professionals(id) ON DELETE SET NULL;
--     -- module_grants.professional_id vuelve con ON DELETE CASCADE.
--
-- 3 · DROP FUNCTION erp.fks_hacia_public();  -- y borrar su test.
--
-- 4 · Recién entonces se puede revertir la 057. Antes no: el DROP de la única
--     compuesta falla mientras cualquiera de estas claves la referencie.
