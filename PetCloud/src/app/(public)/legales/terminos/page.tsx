import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";
import { LegalSection as Seccion } from "@/features/public-site/components/legal-section";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Términos y condiciones de uso de PetCloud, el registro sanitario digital para dueños, veterinarias y municipios.",
};

/** Se actualiza a mano cada vez que cambia el contenido de esta página. */
const ULTIMA_ACTUALIZACION = "4 de septiembre de 2026";

export default function TerminosPage() {
  return (
    <Container className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
          Legales
        </p>
        <h1 className="text-foreground mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Términos y condiciones
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Última actualización: {ULTIMA_ACTUALIZACION}
        </p>

        <Alert variant="warning" className="mt-8">
          <strong>Borrador pendiente de revisión legal.</strong> Este texto
          describe de buena fe cómo funciona {siteConfig.name} hoy, pero todavía
          no fue revisado ni validado por un abogado. No debe tomarse como
          asesoramiento legal ni como una versión definitiva: va a cambiar antes
          de considerarse vigente, y algunas secciones (en particular la ley
          aplicable y la jurisdicción) están marcadas explícitamente como
          pendientes.
        </Alert>

        <div className="mt-10 space-y-10">
          <Seccion numero={1} titulo="Aceptación de estos términos">
            <p>
              Al crear una cuenta en {siteConfig.name} o al usar el servicio de
              cualquier otra forma, aceptás estos términos y la{" "}
              <a
                href="/legales/privacidad"
                className="text-brand-600 hover:underline"
              >
                política de privacidad
              </a>
              . Si no estás de acuerdo con alguna parte, no deberías usar el
              servicio.
            </p>
            <p>
              Si usás {siteConfig.name} en nombre de una veterinaria o de un
              municipio, declarás tener la facultad de obligar a esa institución
              a estos términos.
            </p>
          </Seccion>

          <Seccion numero={2} titulo="Qué es PetCloud">
            <p>
              {siteConfig.name} es un registro sanitario digital para mascotas:
              centraliza el historial de vacunas, antiparasitarios, consultas y
              otros datos de salud de un animal, y lo pone a disposición de su
              dueño, de las veterinarias que lo atienden y, en lo que
              corresponda al padrón sanitario, del municipio de su jurisdicción.
            </p>
            <p>
              El servicio es gratuito para dueños, veterinarias y municipios: no
              hay planes pagos, suscripciones ni pasarela de cobro dentro de la
              aplicación.
            </p>
          </Seccion>

          <Seccion numero={3} titulo="Cuentas y roles">
            <p>
              Existen tres tipos de cuenta —dueño de mascota, veterinaria y
              municipio— con permisos distintos sobre los mismos datos. Sos
              responsable de mantener la confidencialidad de tu contraseña y de
              toda actividad que ocurra desde tu cuenta.
            </p>
            <p>
              Las cuentas de veterinaria quedan sujetas a la validación de la
              matrícula profesional cargada, y las de municipio a la validación
              de la institución. Hasta que esa validación ocurre, el acceso a
              ciertas funciones queda restringido.
            </p>
            <p>
              Una mascota puede tener más de un dueño con acceso completo
              (codueños). Cualquiera de ellos puede compartir o revocar el
              acceso de otras personas a esa mascota; {siteConfig.name} no
              arbitra desacuerdos entre codueños sobre esa decisión.
            </p>
          </Seccion>

          <Seccion numero={4} titulo="Los datos que cargás">
            <p>
              La información de salud, las fotos y los demás datos que cargues
              sobre una mascota le pertenecen a su dueño. Al cargarlos, le das a{" "}
              {siteConfig.name} el permiso necesario para almacenarlos,
              procesarlos y mostrarlos a quienes vos autorices, con el único fin
              de prestar el servicio.
            </p>
            <p>
              Lo que carga un dueño en la libreta queda marcado como no
              verificado hasta que una veterinaria matriculada lo firma
              digitalmente. Sos responsable de que los datos que cargues sean
              correctos.
            </p>
          </Seccion>

          <Seccion numero={5} titulo="El collar QR y las mascotas perdidas">
            <p>
              Cada mascota tiene un código QR que, al escanearse, muestra una
              ficha pública reducida (nombre, especie, raza, estado de
              vacunación) para ayudar a identificarla. El historial clínico
              nunca es parte de esa ficha pública.
            </p>
            <p>
              Cuando se activa una búsqueda por mascota perdida, esa misma ficha
              pasa a mostrar además el contacto de sus dueños, para que
              cualquiera que la encuentre pueda avisarles. Al activar una
              búsqueda, autorizás expresamente esa publicación temporal de tu
              contacto.
            </p>
          </Seccion>

          <Seccion numero={6} titulo="Uso aceptable">
            <p>
              No podés usar {siteConfig.name} para cargar información falsa
              sobre una mascota o una persona, suplantar a otro usuario,
              intentar acceder a datos que no te fueron compartidos, ni usar el
              servicio de una forma que interfiera con su funcionamiento normal
              o con el de otros usuarios.
            </p>
          </Seccion>

          <Seccion
            numero={7}
            titulo="Rol de las veterinarias y de los municipios"
          >
            <p>
              {siteConfig.name} es una herramienta de registro, no presta
              servicios veterinarios ni reemplaza el criterio profesional de
              quien atiende al animal. La responsabilidad por los actos médicos
              veterinarios es de la veterinaria y del profesional que los firma,
              no de {siteConfig.name}.
            </p>
            <p>
              El acceso que tiene un municipio se limita al padrón y al estado
              de vacunación de las mascotas de su jurisdicción; nunca incluye el
              historial clínico detallado.
            </p>
          </Seccion>

          <Seccion numero={8} titulo="Propiedad intelectual">
            <p>
              El software, el diseño y la marca {siteConfig.name} son propiedad
              de quienes lo desarrollan. Estos términos no te dan ningún derecho
              sobre ellos más allá del uso del servicio como está previsto.
            </p>
          </Seccion>

          <Seccion
            numero={9}
            titulo="Disponibilidad y limitación de responsabilidad"
          >
            <p>
              {siteConfig.name} se ofrece &ldquo;tal cual está&rdquo;. Hacemos
              lo posible para que el servicio esté disponible y los datos se
              conserven de forma segura, pero no podemos garantizar que esté
              libre de interrupciones o errores.
            </p>
            <p>
              En la medida que lo permita la ley aplicable, {siteConfig.name} no
              es responsable por decisiones sanitarias tomadas en base a la
              información del sistema, ni por daños indirectos que deriven del
              uso o de la imposibilidad de uso del servicio.
            </p>
          </Seccion>

          <Seccion numero={10} titulo="Cambios a estos términos">
            <p>
              Podemos actualizar estos términos a medida que el servicio cambie.
              Si el cambio es significativo, vamos a avisarlo dentro de la
              aplicación antes de que entre en vigencia. Seguir usando{" "}
              {siteConfig.name} después de un cambio implica aceptarlo.
            </p>
          </Seccion>

          <Seccion numero={11} titulo="Baja de la cuenta">
            <p>
              Podés pedir la baja de tu cuenta cuando quieras desde
              Configuración. Si tenés mascotas con otro codueño, la mascota
              sigue existiendo mientras tenga al menos otro dueño válido; si sos
              su único dueño, sus datos se eliminan junto con tu cuenta.
            </p>
          </Seccion>

          <Seccion numero={12} titulo="Ley aplicable y jurisdicción">
            <p>
              <strong>Pendiente de definición legal.</strong> Esta sección
              todavía no fue completada: la ley aplicable y el fuero competente
              para cualquier disputa se van a fijar cuando este documento pase
              su revisión legal, y no antes.
            </p>
          </Seccion>

          <Seccion numero={13} titulo="Contacto">
            <p>
              Para cualquier consulta sobre estos términos, escribinos a{" "}
              <a
                href={`mailto:${siteConfig.contact.email}`}
                className="text-brand-600 hover:underline"
              >
                {siteConfig.contact.email}
              </a>
              .
            </p>
          </Seccion>
        </div>
      </div>
    </Container>
  );
}
