import { redirect } from "next/navigation";

// Ruta antigua: los métodos de pago viven dentro del módulo P2P.
export default function PaymentMethodsRedirect() {
  redirect("/dashboard/p2p/payment-methods");
}
