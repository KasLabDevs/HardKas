# Fricciones Documentadas - Builder Lab 02

Este documento captura las fricciones (carencias del SDK o puntos de dolor) encontradas al construir el Merchant Checkout.
Cada fricción se convertirá en un requerimiento para un nuevo Helper, Plugin o Template en HardKAS.

> **Regla de Lab 02:** Ningún helper se implementa hasta que la fricción aparezca de forma natural en el código de la aplicación.
>
> **Regla de dos consumidores:** Antes de congelar cualquier helper, debe tener al menos dos aplicaciones consumidoras (ver Labs anteriores).

---

### FRICTION #01: Dirección de pago por factura (✅ RESUELTA — SECOND_CONSUMER_VALIDATED)
**Contexto:** En `createInvoice()`, necesitamos derivar una dirección fresca y única para cada factura del merchant.
**Problema con HardKAS actual:** Aunque `hk.addressManager` existe (Lab 01), el merchant necesita su propia wallet/seedRef para derivar direcciones.
**Resolución:** `WalletManager.create()` + `WalletManager.getSeedRef()` + `AddressManager.deriveReceive()` funcionaron **sin ningún cambio de API**. Los índices de dirección se mantienen en `CheckoutService.merchants` (igual que `WalletService` en Lab 01).
**Segundo consumidor validado:** `WalletManager` y `AddressManager` ahora tienen dos consumidores (Wallet Backend + Merchant Checkout).

### FRICTION #02: Kaspa URI estándar (✅ RESUELTA)
**Contexto:** En `getPaymentUri()`, necesitamos construir una URI tipo `kaspa:address?amount=X&label=Y` que las wallets puedan escanear.
**Problema con HardKAS actual:** No existe un builder de URIs Kaspa. El formato no está documentado en el SDK. Construirlo manualmente es frágil y propenso a errores. Además, la conversión sompi→KAS usaba `Number()` con división flotante.
**Resolución:** Nuevo helper `KaspaURIBuilder` (`hk.kaspaUri.build`) introducido en `packages/tx-builder`. Realiza la conversión con matemática entera pura (`bigint`) para evitar pérdida de precisión y devuelve `amountKasDisplay` formateado de manera segura junto con la `uri` final.

### FRICTION #03: Política de confirmaciones (✅ RESUELTA)
**Contexto:** En `createInvoice()`, necesitamos decidir cuántas confirmaciones requerir antes de considerar un pago "seguro".
**Problema con HardKAS actual:** No hay una política configurable de confirmaciones. Kaspa tiene bloques cada ~1s, así que las reglas son muy diferentes a Bitcoin.
**Resolución:** Nuevo helper `ConfirmationPolicy` (`hk.confirmationPolicy.getRequired`) en `packages/core`. Utiliza umbrales estáticos y perfiles de riesgo (`lenient`, `standard`, `strict`) para dictar requerimientos deterministas. Incluye claims estrictos para no prometer "seguridad de finalización absoluta", indicando explícitamente que es solo para la política local del merchant.

### FRICTION #04: Detección de pagos (✅ RESUELTA)
**Contexto:** En `checkPayment()`, necesitamos detectar si una dirección recibió un pago del importe esperado.
**Problema con HardKAS actual:** Monitorear UTXOs o sockets es un trabajo pesado que acopla la aplicación de negocio (el merchant) al backend de Kaspa.
**Resolución:** Nuevo helper `PaymentTracker` (`hk.paymentTracker.check`) en `packages/query`. Es stateless y puro. Delega la obtención de los UTXOs al `WalletQuery` (reutilizándolo y consolidándolo como 2do consumidor). Retorna estados puros (`not_found`, `partially_paid`, `mempool`, `confirmed`) para que el Merchant Service pueda actualizar su estado sin acoplarse a la red Kaspa.

### FRICTION #05: Evidencia de pago (✅ RESUELTA)
**Contexto:** En `markPaid()`, deberíamos emitir un artifact/evidence que demuestre que el pago ocurrió.
**Problema con HardKAS actual:** El sistema de evidence del SDK no tiene schemas específicos para eventos de pago merchant.
**Resolución:** Nuevo artifact schema `hardkas.paymentReceipt.v1` implementado en `packages/artifacts`. Añadido el helper `hk.paymentReceipts.create(...)` y se integró dentro de `markPaid()` en `CheckoutService.ts`. El artifact resultante provee garantías (claims) determinísticas (declarando de manera estricta `absoluteFinality: false` etc.) sin exponer mnemonics ni material privado.
