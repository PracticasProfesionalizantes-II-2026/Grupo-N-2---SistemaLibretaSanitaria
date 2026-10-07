# Reglas de negocio

Cómo se comporta PetCloud **como producto**, independiente de con qué esté
escrito. Si mañana se reescribe el frontend, esto sigue valiendo; si algo de
acá cambia, cambia el producto, no la implementación.

El mapa del código está en [arquitectura](arquitectura.md).

---

## El servicio es gratuito para dueños y veterinarias

Dueños y veterinarias no pagan por usar PetCloud. Lo único pago es el módulo
Premium de veterinarias (turnos y ERP). En esta demo el pago es simulado: no
hay pasarela de pago real.

## Lo que carga el dueño no es lo mismo que lo que firma un profesional

Todo registro sanitario cargado por el dueño entra con `verified: false`.

Es el corazón del producto: lo que alguien anota de memoria le sirve a él, pero
no equivale a una dosis aplicada y firmada por una matrícula. La pantalla lo dice explícitamente en vez de esconderlo.

## El estado sanitario se deriva, nunca se guarda

"Al día" / "vencido" se calcula mirando las vacunas contra la fecha de hoy. Una
columna guardada diría "al día" sobre una vacuna que venció ayer, porque nadie
la recalculó. Lo mismo aplica a los recordatorios.

## "Sin datos" no es "al día"

Una mascota de la que no sabemos nada tiene estado **`sin-datos`**, gris, y no
`al-dia` en verde. Son estados opuestos: uno afirma algo, el otro dice que no
hay con qué afirmarlo.

Durante mucho tiempo fueron el mismo. No por una decisión: una lista vacía de
vacunas no contiene ninguna vencida ni ninguna próxima, así que caía en el
`return` final de `healthStatus`. Ausencia de evidencia leída como evidencia de
ausencia de problemas.

Dónde importaba: **la ficha pública del collar**. A una mascota sin una sola
dosis cargada, la chapita le decía "Al día" en verde a cualquiera que la
escaneara — y esa pantalla existe, entre otras cosas, para decidir qué hacer
después de una mordedura.

El gris importa tanto como el cuarto estado. "Sin datos" no acusa a nadie: hay
gente con la mascota vacunada que todavía no lo cargó. Dice lo único cierto —
acá no hay con qué responder— y deja la conclusión a quien mira.

Sigue siendo `al-dia` una mascota con vacunas cargadas donde ninguna tiene
refuerzo pendiente: ahí sí hay evidencia, y hay vacunas que no llevan próxima
dosis.

## Sin matrícula validada no hay firma

Un registro clínico —consulta, vacunación, certificado— solo se firma si el
profesional tiene la matrícula validada. Mientras está en validación puede
cargar la atención, pero queda como **borrador** y no se publica en la libreta
del dueño.

Por eso los formularios clínicos tienen siempre dos salidas: _Guardar borrador_
(siempre disponible) y _Firmar y guardar_ (deshabilitado sin firma), con el
motivo explicado en vez de un botón muerto.

La matrícula la valida un administrador de PetCloud desde
`/admin/validaciones`. No hay verificación automática contra el colegio
profesional.

## Las veterinarias atienden por orden de llegada, no con turnos

El modelo es una **cola**, no un calendario: la gente llega y espera. El dueño
no reserva ni cancela nada — su pantalla de Visitas es de solo lectura.

Lo que sí pasa por el sistema es el registro de la llegada y el de qué se le
hizo a la mascota. Esos dos momentos producen el historial que el dueño ve.

Las urgencias entran a la misma cola pero **marcadas**: saltar la fila queda
explícito y auditable, en vez de ser una decisión invisible del mostrador.

La excepción son los **turnos**, que existen solo para instituciones con
Premium activo.

## El collar QR identifica; no expone datos personales

El QR del collar abre una ficha pública (`/p/<código>`) que identifica a la
mascota. El dueño elige qué datos de contacto se muestran ahí.

- **El historial clínico nunca es público**, en ningún estado, con una única
  excepción: el **estado antirrábico**, y solo como estado. Ver abajo.
- **Un código de collar no se reutiliza jamás.** Si uno dado de baja se
  reasignara, un collar viejo llevaría a otro animal.

## La antirrábica es la única excepción sanitaria del collar

Quien escanea una chapita ve si la antirrábica está al día. Es el único dato de
salud que sale hacia un desconocido, y existe por un motivo concreto: si el
animal mordió a alguien, esa persona tiene que decidir **esa misma hora** si
buscar profilaxis. Ninguna otra vacuna le sirve a un tercero.

Sale como **estado y nada más** — al día, por vencer, vencida, o sin
certificar. Nunca el nombre de la vacuna, la fecha, el lote, el laboratorio ni
quién la aplicó. No es que se oculten al pintar la pantalla: no se leen.

**Solo cuentan las dosis firmadas por un veterinario.** Una que cargó el dueño
de memoria le sirve a él y no vale como certificado ante un tercero; contarla
convertiría la chapita en un papel que firma la parte interesada. El costo está
aceptado: una mascota realmente vacunada cuya dosis nadie certificó va a decir
"Sin antirrábica certificada", y eso puede mandar a alguien a una consulta que
no hacía falta. Es la dirección correcta del error — la inversa, un "al día"
autodeclarado que convence a alguien de no tratarse, no se recupera.

**"Vencida" se muestra, aunque delate al dueño.** Se evaluó colapsarla con "sin
certificar" para no exponerlo a una denuncia, y se descartó: encubrir un
incumplimiento a costa de la salud de un tercero es exactamente lo contrario de
por qué esta pantalla existe. Si no cumple, la app no le miente al público para
protegerlo.

## Una mascota sin cargar es un estado real

"Recién me hice la cuenta y todavía no cargué nada" es una situación válida que
todas las pantallas tienen que resolver, no un caso borde. No se asume que
siempre hay datos.

## El alta valida forma, no identidad

La cuenta queda pegada a un registro sanitario que después firma un
profesional: un "asd" en el nombre ensucia un padrón que nadie
limpia. Por eso el alta exige nombre y apellido solo con letras, email con
dominio real y contraseña de al menos 8 con letra y número, que no esté entre
las obvias y que no contenga el nombre ni el email.

Lo que **no** se valida es la identidad real: para el veterinario, eso lo
resuelve la validación de la matrícula.

## Los paneles comparten las entidades, no las copian

La mascota es la **misma fila** para el dueño y para la veterinaria. Lo que
cambia es qué puede ver y editar cada uno, no una copia del dato por panel.

## El acceso compartido tiene tres niveles

Una mascota puede compartirse con otras personas (`pet_shared_access`). Cada
una tiene un nivel, y el orden es `view < edit < owner`:

- **`view`**: solo lectura. Ve la ficha y la libreta; puede descargar el PDF.
- **`edit`**: además edita los datos de la mascota, carga y modifica registros
  de salud, y regenera el QR o cambia la configuración
  del collar.
- **`owner`** (`owner_id` o `permission = 'owner'`): todo lo anterior, más
  compartir, invitar, revocar y cambiar permisos.

Lo hacen cumplir las acciones del servidor (con `has_pet_access()` y
`is_pet_owner()`); la interfaz solo oculta lo que el nivel no puede hacer.
