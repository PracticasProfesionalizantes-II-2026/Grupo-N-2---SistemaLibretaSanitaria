import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";
import { LegalSection as Seccion } from "@/features/public-site/components/legal-section";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Cómo maneja PetCloud los datos de dueños, mascotas, veterinarias y municipios.",
};

/** Se actualiza a mano cada vez que cambia el contenido de esta página. */
const ULTIMA_ACTUALIZACION = "4 de septiembre de 2026";

export default function PrivacidadPage() {
  return (
    <Container className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
          Legales
        </p>
        <h1 className="text-foreground mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Política de privacidad
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Última actualización: {ULTIMA_ACTUALIZACION}
        </p>

        <Alert variant="warning" className="mt-8">
          <strong>Borrador pendiente de revisión legal.</strong> Este texto
          describe de buena fe qué datos maneja {siteConfig.name} y para qué,
          pero todavía no fue revisado ni validado por un abogado. Busca
          alinearse con los principios de la Ley 25.326 de Protección de Datos
          Personales, pero no debe tomarse como una certificación de
          cumplimiento ni como una versión definitiva.
        </Alert>

        <div className="mt-10 space-y-10">
          <Seccion numero={1} titulo="Qué información recolectamos">
            <p>
              Según el rol de la cuenta, {siteConfig.name} guarda distintos
              tipos de datos:
            </p>
            <ul className="ml-5 list-disc space-y-1">
              <li>
                <strong>Dueños de mascota:</strong> nombre, apellido, email,
                teléfono, dirección, municipio declarado y, si la subís, una
                foto de perfil.
              </li>
              <li>
                <strong>Mascotas:</strong> nombre, especie, raza, sexo, fecha de
                nacimiento, peso, foto, historial de vacunas, antiparasitarios,
                medicación, enfermedades y visitas veterinarias.
              </li>
              <li>
                <strong>Veterinarias:</strong> datos de la institución,
                matrícula profesional y los registros que cargan sobre cada
                paciente.
              </li>
              <li>
                <strong>Municipios:</strong> datos de la institución y del
                personal que administra el padrón sanitario de su jurisdicción.
              </li>
              <li>
                <strong>Uso del servicio:</strong> qué páginas visitás dentro de
                la aplicación, para poder corregir errores y mejorar el
                producto. No usamos esto para publicidad.
              </li>
            </ul>
          </Seccion>

          <Seccion numero={2} titulo="Para qué usamos estos datos">
            <p>
              Para prestar el servicio: mostrarte la libreta sanitaria de tu
              mascota, dejar que una veterinaria matriculada cargue y firme
              registros, generar el collar QR, avisarte cuando una vacuna está
              por vencer, notificarte si alguien reporta haber visto a tu
              mascota perdida, y darle al municipio de tu jurisdicción el padrón
              y el estado de vacunación que le corresponde.
            </p>
            <p>
              No vendemos datos personales a terceros, ni los usamos para
              publicidad dirigida.
            </p>
          </Seccion>

          <Seccion numero={3} titulo="Con quién se comparte cada dato">
            <p>
              El historial clínico de una mascota lo ven su dueño (y sus
              codueños, si tiene más de uno) y las veterinarias que la atienden.
              Nunca es público ni lo ve un municipio.
            </p>
            <p>
              El municipio de tu jurisdicción accede únicamente al padrón (que
              existe la mascota, quién es su dueño declarado) y al estado de
              vacunación — nunca al detalle de qué vacuna, cuándo ni quién la
              aplicó.
            </p>
            <p>
              El código QR del collar muestra, sin que quien lo escanea tenga
              cuenta, una ficha reducida: nombre, especie, raza y estado de
              vacunación general. Si activás una búsqueda por mascota perdida,
              esa misma ficha pasa a mostrar además el nombre y teléfono de sus
              dueños, hasta que la búsqueda se cierra.
            </p>
          </Seccion>

          <Seccion numero={4} titulo="Dónde se almacenan los datos">
            <p>
              {siteConfig.name} guarda la base de datos, las cuentas y los
              archivos (fotos, documentos) en su propia infraestructura. El
              acceso a cada dato se valida en el servidor, no solo en la
              interfaz: cada consulta se controla contra quién sos y qué rol
              tenés.
            </p>
          </Seccion>

          <Seccion numero={5} titulo="Cookies y almacenamiento local">
            <p>
              Usamos únicamente lo necesario para que la sesión funcione: una
              cookie que identifica tu inicio de sesión, y algunos datos
              guardados en tu navegador (como la mascota que tenés seleccionada)
              para no pedírtelo de nuevo en cada pantalla. No usamos cookies de
              rastreo publicitario ni de redes sociales.
            </p>
          </Seccion>

          <Seccion numero={6} titulo="Tus derechos sobre tus datos">
            <p>Sobre tus propios datos, y los de tu mascota, podés:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>Acceder a ellos y descargar la libreta en PDF.</li>
              <li>
                Corregirlos desde tu perfil o pidiéndolo a tu veterinaria.
              </li>
              <li>
                Elegir qué campos son públicos en el QR (desde la configuración
                del collar de cada mascota).
              </li>
              <li>
                Pedir la baja de tu cuenta, lo que elimina tus datos salvo que
                una mascota tuya siga teniendo otro dueño válido, en cuyo caso
                la mascota sigue existiendo con él.
              </li>
            </ul>
          </Seccion>

          <Seccion numero={7} titulo="Menores de edad">
            <p>
              {siteConfig.name} no está pensado para que lo usen menores de edad
              de forma directa. Si un padre o tutor carga datos de una mascota
              familiar, lo hace bajo su propia cuenta y responsabilidad.
            </p>
          </Seccion>

          <Seccion numero={8} titulo="Cambios a esta política">
            <p>
              Podemos actualizar esta política a medida que el servicio cambie.
              Si el cambio es significativo, vamos a avisarlo dentro de la
              aplicación antes de que entre en vigencia.
            </p>
          </Seccion>

          <Seccion numero={9} titulo="Contacto">
            <p>
              Para ejercer cualquiera de tus derechos o hacer una consulta sobre
              tus datos, escribinos a{" "}
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
