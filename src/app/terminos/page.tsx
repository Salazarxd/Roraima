import React from "react";
import { Navbar } from "@/components/navbar";

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-24 pb-12">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-8 sm:p-12 shadow-xl border border-zinc-100 dark:border-zinc-800">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-8">
            Términos y Condiciones Generales de Servicio
          </h1>
          
          <div className="prose dark:prose-invert max-w-none space-y-6 text-zinc-600 dark:text-zinc-300 text-sm text-justify">
            <p className="font-semibold text-base">Fecha de última entrada en vigencia: 09 de Octubre de 2026</p>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">1. ACEPTACIÓN Y NATURALEZA JURÍDICA</h2>
              <p>
                El presente documento (en adelante, los "Términos y Condiciones" o "Acuerdo") establece el marco jurídico vinculante que rige el acceso, registro y uso de la plataforma digital, sitio web y aplicaciones móviles de Roraima Capital's Exchange (en adelante, "la Plataforma" o "la Compañía"). 
                Al registrarse, acceder o utilizar nuestros servicios, usted (en adelante, el "Usuario") reconoce haber leído, entendido y aceptado de manera expresa, libre e inequívoca la totalidad de las cláusulas aquí estipuladas. Si el Usuario no está de acuerdo con alguna disposición de este documento o de nuestra Política de Privacidad, debe abstenerse de manera inmediata de utilizar la Plataforma.
              </p>
              <p>
                Roraima Capital's Exchange se reserva el derecho unilateral y absoluto de modificar, enmendar o actualizar estos Términos y Condiciones en cualquier momento y sin previo aviso, siendo responsabilidad exclusiva del Usuario revisar periódicamente este documento. El uso continuado de la Plataforma después de cualquier modificación constituirá una aceptación tácita de los nuevos términos.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">2. DESCRIPCIÓN DEL SERVICIO Y AUSENCIA DE INTERMEDIACIÓN FINANCIERA</h2>
              <p>
                Roraima Capital's Exchange opera de manera <strong>estricta y exclusiva</strong> como una plataforma tecnológica de encuentro Peer-to-Peer (P2P). Proporcionamos un software tipo "Tablero de Anuncios" (Bulletin Board) y un sistema de depósito en garantía de activos digitales (Escrow) que facilita que compradores y vendedores independientes transen criptoactivos entre sí.
              </p>
              <p className="font-bold text-rose-600 dark:text-rose-400">
                ADVERTENCIA LEGAL: Roraima Capital's Exchange NO es un banco, NO es una institución financiera, NO realiza captación de fondos del público, NO otorga créditos, NO emite moneda fiduciaria ni criptográfica y NO compra ni vende criptoactivos de manera directa a los usuarios. Los pagos en moneda de curso legal (Bolívares u otras divisas fiat) se realizan única y exclusivamente fuera de la plataforma, a través de transferencias bancarias o sistemas de pago directo entre los Usuarios. La Plataforma jamás toca, retiene o procesa dinero fiduciario.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">3. ELEGIBILIDAD, REGISTRO Y CONOZCA A SU CLIENTE (KYC)</h2>
              <p>
                Para ser elegible para el uso de la Plataforma, el Usuario declara bajo fe de juramento que: a) Es una persona natural mayor de dieciocho (18) años de edad con plena capacidad jurídica; b) No ha sido suspendido previamente de nuestra plataforma; c) Los fondos utilizados tienen un origen lícito y no provienen de actividades relacionadas con narcotráfico, terrorismo, corrupción, extorsión, fraude o cualquier otro delito tipificado en la legislación venezolana e internacional.
              </p>
              <p>
                En estricto cumplimiento con la <strong>Ley Orgánica contra la Delincuencia Organizada y Financiamiento al Terrorismo (LOCDOFT)</strong>, la Plataforma implementa procedimientos obligatorios de Conozca a su Cliente (KYC) y Prevención de Legitimación de Capitales (AML). El Usuario está obligado a proporcionar información veraz, exacta y comprobable (incluyendo pero no limitándose a: Cédula de Identidad, Pasaporte, RIF, comprobantes de domicilio y pruebas de vida biométricas). 
                La Compañía se reserva el derecho de rechazar cualquier registro o suspender cuentas existentes si la información provista es falsa, incompleta o genera alertas en nuestros sistemas de gestión de riesgos. Las Personas Expuestas Políticamente (PEPs) estarán sujetas a debida diligencia ampliada y la Plataforma se reserva el derecho de admisión de las mismas.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">4. SISTEMA DE GARANTÍA (ESCROW) Y RESOLUCIÓN DE DISPUTAS</h2>
              <p>
                Para garantizar la seguridad de las transacciones P2P, la Plataforma retiene temporalmente los criptoactivos del vendedor en un contrato de Escrow desde el momento en que se abre una orden hasta que el vendedor confirma fehacientemente la recepción de los fondos fiduciarios.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Obligaciones del Comprador:</strong> Debe transferir el dinero fiduciario utilizando ÚNICAMENTE cuentas bancarias a su propio nombre, dentro de la ventana de tiempo estipulada, y marcar la orden como "Pagada". El uso de cuentas de terceros (triangulación) está TERMINANTEMENTE PROHIBIDO y es causal de suspensión inmediata y posible pérdida de fondos.</li>
                <li><strong>Obligaciones del Vendedor:</strong> Debe verificar el saldo en su cuenta bancaria. Nunca debe liberar los criptoactivos basándose únicamente en comprobantes enviados por el comprador, correos electrónicos o SMS, ya que estos pueden ser falsificados.</li>
                <li><strong>Apelaciones (Disputas):</strong> Si existe un desacuerdo, cualquiera de las partes puede iniciar una disputa. En este escenario, el equipo de Soporte y Mediación de Roraima Capital's Exchange intervendrá. El equipo exigirá pruebas fehacientes (estados de cuenta en video, capturas de pantalla, comprobantes bancarios). <strong>LA DECISIÓN DEL EQUIPO DE SOPORTE ES FINAL E INAPELABLE</strong>. Al usar la plataforma, usted cede el derecho de arbitraje final sobre los criptoactivos en custodia a la Compañía.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">5. EXENCIÓN EXHAUSTIVA DE RESPONSABILIDAD</h2>
              <p>
                Roraima Capital's Exchange proporciona sus servicios "TAL CUAL" ("AS IS") y "SEGÚN DISPONIBILIDAD". No garantizamos que el servicio sea ininterrumpido, libre de errores o completamente inmune a ataques cibernéticos avanzados.
                En la máxima medida permitida por la ley aplicable en la República Bolivariana de Venezuela, el Usuario acepta EXONERAR DE TODA RESPONSABILIDAD CIVIL, PENAL, ADMINISTRATIVA Y CONTRACTUAL a Roraima Capital's Exchange, sus accionistas, directores, representantes legales, empleados, contratistas y filiales, por cualquier daño directo, indirecto, incidental, especial, punitivo o consecuente, pérdida de ganancias, pérdida de ingresos, pérdida de datos o pérdida de fondos que resulten de:
              </p>
              <ol className="list-decimal pl-5 mt-2 space-y-2">
                <li>La extrema volatilidad de los precios de los criptoactivos o del tipo de cambio del mercado fiduciario venezolano.</li>
                <li>Errores del usuario al proporcionar direcciones de billeteras (wallets) incorrectas, redes blockchain equivocadas (ej. enviar por ERC20 en lugar de TRC20), u omisión de etiquetas (memos). Las transferencias blockchain son irreversibles y la Compañía no puede recuperar fondos perdidos por negligencia del usuario.</li>
                <li>Bloqueos, retenciones preventivas, congelamiento de cuentas o cierres unilaterales de sus cuentas bancarias realizados por instituciones financieras venezolanas (SUDEBAN) motivados por sus transacciones P2P. El Usuario asume el 100% del riesgo bancario.</li>
                <li>Fraudes, esquemas ponzi, estafas trianguladas, ataques de phishing o ingeniería social perpetrados por otros Usuarios o terceros fuera de la plataforma.</li>
                <li>Fallas sistémicas de la red eléctrica nacional, caídas de conectividad a internet en Venezuela, o mantenimientos no programados de emergencia en los servidores de la Plataforma.</li>
                <li>Decisiones normativas, leyes, decretos o providencias sorpresivas emitidas por el Estado Venezolano, la Superintendencia Nacional de Criptoactivos (SUNACRIP) o cualquier otro organismo regulador que limite, prohíba o regule de manera adversa la tenencia o el comercio de criptoactivos.</li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">6. SEGURIDAD DE LA CUENTA</h2>
              <p>
                El Usuario es el único y exclusivo responsable de mantener la confidencialidad de sus credenciales de acceso, contraseñas, correos electrónicos y códigos de Autenticación de Dos Factores (2FA). Roraima Capital's Exchange NUNCA le solicitará su contraseña ni sus claves privadas por ningún medio (redes sociales, correo, teléfono). Cualquier acceso no autorizado a su cuenta debido al compromiso de sus credenciales será responsabilidad exclusiva del Usuario, exonerando a la Compañía por los fondos sustraídos.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">7. IMPUESTOS Y CARGAS TRIBUTARIAS</h2>
              <p>
                Es entera responsabilidad del Usuario declarar, determinar, calcular y pagar todos los impuestos, tasas, contribuciones o aranceles aplicables (como el Impuesto a las Grandes Transacciones Financieras IGTF, Impuesto Sobre La Renta ISLR, entre otros) que las leyes de la República Bolivariana de Venezuela determinen sobre sus transacciones, operaciones comerciales o ganancias de capital derivadas del comercio de criptoactivos. Roraima Capital's Exchange no actúa como agente de retención a menos que la ley lo dicte expresamente de forma imperativa.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">8. SUSPENSIÓN Y TERMINACIÓN UNILATERAL</h2>
              <p>
                Roraima Capital's Exchange se reserva el derecho absoluto, a su entera discreción y sin previo aviso o responsabilidad, de suspender, restringir o terminar el acceso del Usuario a la Plataforma de forma temporal o permanente si: 
                (i) Existe sospecha de violación de estos Términos; (ii) Recibimos requerimientos u órdenes de autoridades judiciales o cuerpos de seguridad (ej. CICPC, Ministerio Público); (iii) Detectamos comportamientos abusivos, maliciosos o que comprometan la integridad de la red; (iv) Se detectan intentos de fraude al sistema de Escrow o la presentación de comprobantes bancarios falsos.
                En caso de terminación, los fondos lícitos no disputados le serán devueltos en la medida en que la ley lo permita, restando los costos administrativos pertinentes. Si los fondos están sujetos a investigaciones por fraude, serán congelados indefinidamente hasta la resolución del tribunal competente.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">9. LEY APLICABLE Y RESOLUCIÓN DE CONFLICTOS</h2>
              <p>
                Estos Términos y Condiciones, así como cualquier disputa que surja o esté relacionada con su objeto, se regirán e interpretarán de acuerdo con las leyes de la República Bolivariana de Venezuela. El Usuario acepta someterse, de manera exclusiva e irrevocable, a la jurisdicción ordinaria de los Tribunales competentes de la Circunscripción Judicial del Área Metropolitana de Caracas, renunciando de manera expresa a cualquier otro fuero o domicilio que pudiere corresponderle por razón de su nacionalidad, domicilio presente o futuro.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
