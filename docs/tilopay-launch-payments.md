# Cobros de LEURET con Tilopay

El lanzamiento está previsto para el 2 de enero de 2027 en Panamá.

## Membresías de LEURET

LEURET TECH cobra las membresías web en USD mediante Tilopay Repeat. Gratis ofrece las calculadoras. Independiente cuesta $12.99 al mes e incluye al titular. Empresa cuesta $39.99 al mes e incluye 5 usuarios. Constructora cuesta $99.00 al mes e incluye 15 usuarios. Los cupos incluyen al titular según el catálogo de la API.

La prueba ordinaria dura 7 días. Los primeros 50 usuarios que verifiquen su correo desde la apertura de la campaña reciben 3 meses calendario sin tarjeta. El checkout debe mostrar el precio y la fecha del primer cargo antes de que el usuario autorice una renovación. La API confirma el estado de la suscripción con Tilopay antes de conceder acceso por un cobro.

## Pagos de obras

El cliente paga el monto de la factura o del avance en el checkout alojado. El pago de su obra está disponible sin membresía. LEURET recibe el 15 % del importe cobrado y el contratista recibe el 85 %, antes del costo de la pasarela y los impuestos aplicables. El 15 % se incluye en el importe que el cliente ya debe por el trabajo.

Un trabajo de $1,000 pagado con un anticipo de $300 y un saldo de $700 genera dos repartos. Del anticipo, $45 corresponden a LEURET y $255 al contratista. Del saldo, $105 corresponden a LEURET y $595 al contratista.

La [API de liquidación dividida](https://tilopay.com/developers/api/procesos-operativos/split) opera sobre órdenes aprobadas y requiere comercios aprobados en el mismo país bajo la modalidad de facilitador de pagos. Usar el identificador de comercio verificado del contratista. Tilopay debe confirmar qué comercio inicia el cargo, a quién se debitan las comisiones y cómo se revierten ambas partes.

Registrar el importe en centavos y acumular la comisión por trabajo. El reparto de cada pago es la diferencia entre la comisión redondeada sobre el nuevo total cobrado y la comisión ya asignada. Así los anticipos y avances suman el 15 % del total, redondeado al centavo.

Confirmar la orden consultando a Tilopay y comparando referencia, importe y moneda. Registrar por separado el estado de pago y el estado del reparto. Un pago confirmado con reparto pendiente conserva su registro y se concilia antes de reintentar el reparto. Ante una respuesta incierta, verificar si ya existe un reparto para esa orden. Usar un identificador único por operación para evitar contabilizar dos veces un mismo pago. Aplicar la misma trazabilidad a reembolsos parciales, reembolsos totales y contracargos.

## Confirmaciones para activar los cobros

- Completar la [afiliación de LEURET TECH](https://tilopay.com/guias/afiliacion/como-afiliarse-a-tilopay) y solicitar Repeat y liquidación dividida en Panamá.
- Confirmar si pueden afiliarse tanto contratistas independientes como empresas y cómo se vinculan sus cuentas con LEURET.
- Cotizar tarifas, plazos, reservas y contracargos. Confirmar si Yappy admite el reparto para esta modalidad y probarlo por separado de tarjeta.
- Acordar quién absorbe el costo de procesamiento, quién aparece como comercio del cargo y quién responde por reembolsos y disputas. Reflejar el acuerdo en el checkout y las condiciones del contratista.
- Verificar en el entorno habilitado por Tilopay una compra, una renovación, un pago de obra y el reparto de este último. Probar notificaciones duplicadas y reversión antes de activar producción.
