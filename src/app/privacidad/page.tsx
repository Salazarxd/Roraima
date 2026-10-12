import React from "react";
import { Navbar } from "@/components/navbar";

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-24 pb-12">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-8 sm:p-12 shadow-xl border border-zinc-100 dark:border-zinc-800">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-8">
            Política de Privacidad y Tratamiento de Datos
          </h1>
          
          <div className="prose dark:prose-invert max-w-none space-y-6 text-zinc-600 dark:text-zinc-300 text-sm text-justify">
            <p className="font-semibold text-base">Fecha de última entrada en vigencia: 09 de Octubre de 2026</p>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">1. INTRODUCCIÓN Y MARCO REGULATORIO</h2>
              <p>
                En Roraima Capital's Exchange ("la Plataforma", "nosotros", "nuestro"), consideramos que la privacidad y la protección de los datos personales de nuestros usuarios es de absoluta prioridad e importancia. 
                Esta Política de Privacidad describe de manera detallada y exhaustiva cómo recopilamos, procesamos, almacenamos, usamos, compartimos y protegemos la información personal y financiera de nuestros usuarios en cumplimiento con el marco jurídico de la República Bolivariana de Venezuela y los estándares internacionales de protección de datos aplicables.
              </p>
              <p>
                Las políticas aquí descritas se ejecutan bajo los lineamientos obligatorios de la Ley Orgánica contra la Delincuencia Organizada y el Financiamiento al Terrorismo (LOCDOFT), providencias de la Superintendencia de las Instituciones del Sector Bancario (SUDEBAN) para entes regulados de manera conexa, resoluciones de la Unidad Nacional de Inteligencia Financiera (UNIF) y lineamientos aplicables por la Superintendencia Nacional de Criptoactivos (SUNACRIP).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">2. RECOPILACIÓN DE INFORMACIÓN (QUÉ DATOS OBTENEMOS)</h2>
              <p>
                Para prestar nuestros servicios de intermediación segura, requerimos recopilar información sensible de diversas categorías:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Información de Identidad (Proceso KYC):</strong> Nombres, apellidos, número de Cédula de Identidad (V o E) o Pasaporte, fecha de nacimiento, estado civil, nacionalidad, fotografía de su documento de identidad y registro fotográfico facial (selfie y/o prueba de vida en video).</li>
                <li><strong>Información de Contacto y Localización:</strong> Dirección de correo electrónico verificada, número de teléfono móvil (para envíos de códigos SMS/WhatsApp), dirección física de residencia completa con comprobante de domicilio (recibos de servicios).</li>
                <li><strong>Información Financiera:</strong> Datos de sus cuentas bancarias, números de Pago Móvil, pseudónimos (C2P), billeteras digitales y volumen estimado de comercio proyectado mensual, requeridos para trazar la legitimidad de las transacciones (AML).</li>
                <li><strong>Información Técnica e Identificadores de Dispositivo:</strong> Direcciones IP (Protocolo de Internet), proveedor de servicios de internet (ISP), coordenadas de geolocalización, información de la red móvil, sistema operativo, tipo y versión del navegador web, y los identificadores únicos de dispositivo (MAC address) de los dispositivos con los que accede a su cuenta.</li>
                <li><strong>Información Transaccional y de Actividad:</strong> Registros completos y detallados de todas las operaciones realizadas, depósitos, retiros, disputas abiertas en el comercio P2P, interacciones en el chat de soporte, y mensajes enviados a otras contrapartes en la plataforma.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">3. FINALIDAD Y USO DE LA INFORMACIÓN</h2>
              <p>
                Su información personal es el núcleo de nuestros sistemas de prevención de fraudes. Utilizamos sus datos para las siguientes finalidades esenciales:
              </p>
              <ol className="list-decimal pl-5 mt-2 space-y-1">
                <li>Establecer su identidad y aprobar, denegar o limitar el acceso a nuestros servicios en base a su perfil de riesgo.</li>
                <li>Procesar las transacciones y gestionar el sistema de Escrow P2P, garantizando que quien envía y recibe el dinero fiduciario es el legítimo titular.</li>
                <li>Arbitrar disputas: Durante un conflicto en el mercado P2P, nuestro equipo de soporte revisará su información transaccional y conversaciones de chat para emitir un fallo y proteger los fondos.</li>
                <li>Prevenir, mitigar y descubrir de manera activa fraudes, robos de identidad, triangulaciones financieras, extorsiones, blanqueo de capitales y financiamiento al terrorismo.</li>
                <li>Envío de notificaciones críticas, alertas de seguridad (como intentos de inicio de sesión no reconocidos) y cambios en nuestros servicios.</li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">4. REVELACIÓN Y COMPARTICIÓN DE DATOS A TERCEROS</h2>
              <p>
                Roraima Capital's Exchange prohíbe categóricamente la venta o comercialización comercial de los datos personales de sus usuarios. Sin embargo, estamos OBLIGADOS a revelar su información en las siguientes circunstancias críticas:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Autoridades Judiciales y Cuerpos de Seguridad del Estado:</strong> Revelaremos sin dilación sus datos personales, historial de IP, movimientos, conversaciones en chat de disputas y saldos, al Cuerpo de Investigaciones Científicas, Penales y Criminalísticas (CICPC), el Servicio Bolivariano de Inteligencia Nacional (SEBIN), la Dirección General de Contrainteligencia Militar (DGCIM), Fiscalías del Ministerio Público, Tribunales Nacionales, y la Unidad Nacional de Inteligencia Financiera (UNIF), ante la presentación de requerimientos legales vigentes o en caso de Reportes de Actividades Sospechosas (RAS) que debamos elevar de oficio por ley.</li>
                <li><strong>Usuarios P2P (Contrapartes):</strong> Para facilitar el comercio P2P, su contraparte comercial verá su nombre real completo, detalles bancarios que usted disponga y su reputación transaccional. No podrán ver sus documentos de identidad ni su correo.</li>
                <li><strong>Proveedores de Servicios Tecnológicos:</strong> Compartimos su data, bajo contratos de confidencialidad estrictos, con proveedores de nube (ej. Amazon Web Services, Google Cloud), proveedores de validación biométrica y de correos masivos que garantizan la operatividad de nuestra infraestructura.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">5. RETENCIÓN Y CUSTODIA HISTÓRICA DE DATOS</h2>
              <p>
                Debido a la naturaleza financiera de nuestros servicios, la eliminación inmediata de su cuenta no significa la destrucción de sus datos. En cumplimiento de las normativas de prevención de lavado de dinero de la República Bolivariana de Venezuela, Roraima Capital's Exchange se ve en la obligación legal de almacenar sus registros de Conozca a su Cliente (KYC), documentos de identidad adjuntos, historial completo de transacciones y registros de IP por un período ineludible de diez (10) años, contados a partir de la clausura de su cuenta o la culminación de su última operación, sea cual fuere el evento que ocurra de último. Una vez expirado este periodo, los datos serán anonimizados o destruidos criptográficamente.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">6. MEDIDAS DE SEGURIDAD INFORMÁTICA</h2>
              <p>
                Implementamos un entorno tecnológico fortificado para proteger su información contra pérdida, robo, alteración o acceso no autorizado. Esto incluye cifrado AES-256 para bases de datos sensibles en reposo, enrutamiento mediante certificados TLS 1.3 de extremo a extremo, sistemas robustos de mitigación DDoS, cortafuegos de aplicaciones web (WAF) y controles de acceso basados en privilegios mínimos (Zero Trust) para nuestro personal de soporte. 
                No obstante, la transmisión de información por Internet nunca es 100% segura; por lo tanto, el Usuario asume y entiende que Roraima Capital's Exchange no puede garantizar la invulnerabilidad absoluta frente a vulnerabilidades de día cero o ataques de estados nación.
              </p>
            </section>
            
            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">7. DERECHOS DEL USUARIO</h2>
              <p>
                Sujeto a las limitaciones expuestas en la sección de "Retención de Datos", usted posee el derecho de rectificar, actualizar o solicitar explicaciones respecto de la información que reposa en nuestros sistemas. Para ejercer estos derechos, debe elevar una solicitud a través del módulo de Soporte Integrado de la Plataforma o en la sección de contacto. Responderemos a su solicitud en los lapsos estipulados por el departamento legal.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
