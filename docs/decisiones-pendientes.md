# Decisiones pendientes del equipo

Tres temas que **no están implementados** y que el equipo (y, en el primero, la profesora) tiene que decidir. Para cada uno: la situación actual, las opciones con sus ventajas y desventajas, cuánto trabajo cuesta y qué cambia en el modelo de datos. **Nada de esto se programa hasta que se decida.**

| # | Tema | Hoy | Recomendación |
|---|---|---|---|
| 1 | Acceso de estudiantes (UC-02) | Está en el diagrama de casos de uso, pero no en el modelo de datos ni en el código | Consultarlo con la profesora. Si no es obligatorio, quitarlo del diagrama (opción A) |
| 2 | Recuperación de contraseña | La página de inicio de sesión dice «contacta al administrador», pero el administrador no tiene cómo hacerlo desde la web | Que el administrador la restablezca desde la web (opción A) |
| 3 | Aviso de privacidad | Borrador sin valor legal | Que el equipo complete los datos que faltan y confirme qué ley aplica |

---

## 1. Acceso de estudiantes (UC-02)

### Situación

El documento de modelado tiene el caso de uso UC-02, «inicio de sesión del estudiante», pero:

- El modelo entidad-relación no le da contraseña al ESTUDIANTE (solo USUARIO la tiene) y el rol solo admite «Docente» o «Administrador».
- Ningún diagrama de actividades ni pantalla (P1 a P5) dice qué haría el estudiante después de entrar.
- La API y la web solo tienen Docente y Administrador.

Es una inconsistencia del documento entregado: o se implementa, o se quita.

### Opciones

| | A. Quitarlo del diagrama | B. Estudiante con contraseña | C. Estudiante con enlace por correo |
|---|---|---|---|
| Qué es | UC-02 pasa a «fuera de alcance» en el documento | El estudiante entra con su correo institucional y una contraseña, y ve **solo sus** asistencias | El estudiante escribe su correo institucional y recibe un enlace de un solo uso, válido unos minutos |
| Ventajas | Sin trabajo de programación ni riesgo. El documento queda coherente con el sistema | Igual que el docente: lo conocido. No depende de un servicio externo | No hay contraseñas de estudiantes que guardar, repartir ni recuperar |
| Desventajas | El estudiante no puede consultar su asistencia (se la pregunta al docente) | Hay que repartir contraseñas iniciales a todos los estudiantes y atender olvidos (ver tema 2). Más datos sensibles que proteger | Depende de un servicio de correo (cuenta SMTP y su clave en el servidor). Si el correo tarda o cae en spam, no entra. Más difícil de demostrar sin internet |
| Cambio al modelo | Ninguno | Migración 005: contraseña para el estudiante (en ESTUDIANTE, o como USUARIO con rol «Estudiante» ligado a su ESTUDIANTE) | Migración 005: tabla nueva para los enlaces (hash del token, vencimiento, fecha de uso) |
| Trabajo | Solo actualizar el documento de modelado | Una entrega más de la web: migración, inicio de sesión, pantalla «Mis asistencias», cambio de contraseña, pruebas de aislamiento (un estudiante no ve a otro) | Lo de B sin las contraseñas, más el envío de correos y su configuración. Si se hace el tema 2 con la opción B, buena parte ya estaría hecha |
| Documentación | Marcar UC-02 como excluido | Diagrama de actividades nuevo, pantalla nueva, ER actualizado | Igual que B |

### Recomendación

Preguntarle a la profesora si UC-02 es obligatorio. **Si no lo es, la opción A**: el semestre está por terminar, y lo que falta (P4, P5, el lector y la puesta en marcha) es más importante para que el sistema funcione. Si es obligatorio, la opción B es la más predecible; la C conviene solo si también se elige el correo para el tema 2.

Mientras no se decida, la web sigue solo con Docente y Administrador (decisión del 15 de noviembre).

---

## 2. Recuperación de contraseña

### Situación

En P1, «¿Olvidaste tu contraseña?» muestra «contacta al administrador del sistema». Pero hoy **el administrador no tiene forma de cambiar una contraseña desde la web**: no hay pantalla de usuarios. Solo se puede con SQL directo en la base.

### Opciones

| | A. La restablece el administrador | B. Enlace por correo con un token de un solo uso |
|---|---|---|
| Cómo funciona | El usuario avisa al administrador. Este genera una contraseña temporal desde la web y se la da en persona. Al entrar con ella, el sistema obliga a cambiarla | El usuario escribe su correo en P1. Si existe, recibe un enlace válido unos 30 minutos y de un solo uso para poner una contraseña nueva |
| Ventajas | Sin servicios externos. El administrador comprueba en persona quién la pide. Queda en la bitácora. Coincide con lo que ya dice P1 | El usuario no depende de nadie, a cualquier hora. Es lo que muestra el boceto de P1 |
| Desventajas | Depende de que el administrador esté disponible. La contraseña temporal pasa por una persona | Necesita un servicio de correo y su clave. Si alguien controla el correo de un docente, controla su cuenta. Más piezas que probar |
| Cambio al modelo | Migración 005: `usuario.debe_cambiar_contrasena` (sí o no) | Migración 005: tabla nueva de tokens (usuario, hash del token, vencimiento, fecha de uso). El token nunca se guarda en claro |
| Trabajo | 2 endpoints (restablecer, cambiar la propia contraseña), la pantalla «Cambiar contraseña» y el botón en la parte de administración. Pruebas de permisos y de bitácora | 3 endpoints (pedir, validar, cambiar), 2 pantallas, envío de correos, límites contra abuso, pruebas. Más configuración en la puesta en marcha |

Reglas que aplican a las dos:

- La respuesta nunca dice si un correo existe o no (igual que el inicio de sesión hoy).
- **Limitación conocida:** hoy un JWT no se puede revocar uno por uno (es un pendiente del README). Después de cambiar la contraseña, una sesión abierta en otro equipo sigue funcionando hasta que vence (8 horas). Para cerrarlas todas, haría falta guardar en USUARIO la fecha del último cambio y rechazar los tokens anteriores: un cambio pequeño que conviene hacer junto con cualquiera de las dos opciones.

### Recomendación

**La opción A.** Ya es lo que promete la pantalla, no depende de un servicio de correo y aprovecha la bitácora. Se puede hacer junto con la entrega 4 (P4 y P5, la parte del administrador). La opción B queda como mejora para después de la puesta en marcha.

---

## 3. Aviso de privacidad

### Situación

La página de inicio de sesión dice «Al ingresar aceptas el Aviso de privacidad (LFPDPPP)» y enlaza a `web/src/paginas/AvisoPrivacidad.tsx`, que es un **borrador** marcado como tal. El texto definitivo lo redacta el equipo (decisión del 18 de noviembre). Esta sección no lo redacta: solo revisa qué le falta.

### Antes de todo: ¿qué ley aplica?

El enlace cita la **LFPDPPP** (Ley Federal de Protección de Datos Personales en Posesión de los **Particulares**). Esa ley es para empresas y personas privadas. La Universidad de Guadalajara es un organismo público, y a los organismos públicos les aplica otra: la **Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados** y, en Jalisco, la ley estatal equivalente.

Cuál aplica depende de **quién es el responsable** de los datos:

- Si el sistema lo opera la universidad (por ejemplo, si se usa de verdad en CUCEI), el responsable es la universidad y aplica la ley de sujetos obligados. El aviso tendría que seguir el formato de la universidad y revisarlo su **Unidad de Transparencia**.
- Si es solo un proyecto escolar que opera el equipo, el responsable sería el equipo (como particulares) y la LFPDPPP sí aplicaría.

Las dos leyes se reformaron en 2025, así que conviene revisar el texto vigente. **Esto es algo a confirmar con la profesora o con la Unidad de Transparencia, no una conclusión.** En los dos casos, los elementos que pide un aviso de privacidad son muy parecidos; la lista de abajo sirve para cualquiera.

### Qué tiene el borrador y qué le falta

| Elemento que pide la ley | ¿Está en el borrador? | Qué falta |
|---|---|---|
| **Identidad y domicilio del responsable** | ❌ No | Quién es el responsable (la universidad o el equipo) y su domicilio |
| **Datos personales que se recaban** | ✅ Sí, en general | Agregar la dirección IP (se usa en memoria para limitar intentos de inicio de sesión) y la cookie de sesión. Decir si hay datos **sensibles** (no parece haberlos) |
| **Finalidades** | ⚠️ En parte («registrar y consultar la asistencia») | Separar las necesarias (registrar asistencia, reportes al docente, seguridad y bitácora) de las que no lo son, si las hubiera. Decir si los reportes se usan para calificar |
| **Fundamento legal** (solo para sujetos obligados) | ❌ No | Las facultades de la universidad que permiten tratar esos datos |
| **Transferencias** (a quién se comparten) | ❌ No | Decir que no se comparten con terceros, o con quién y para qué |
| **Derechos ARCO** (acceso, rectificación, cancelación y oposición) | ❌ No | Que existen y que el titular puede ejercerlos |
| **Medios y procedimiento para ejercer los derechos ARCO** | ❌ No | Un correo o una oficina concretos, qué documentos llevar y en cuánto tiempo se responde |
| **Revocación del consentimiento y opciones para limitar el uso** | ❌ No | Cómo pedirlo y qué pasa con la asistencia si alguien lo revoca |
| **Uso de cookies** | ❌ No | La web usa una sola cookie, de sesión (`taplist_sesion`), necesaria para entrar; no hay cookies de rastreo ni publicidad |
| **Cambios al aviso** | ❌ No | Cómo y dónde se avisará si el texto cambia |
| **Fecha de la última actualización** | ❌ No | |
| **Conservación** (cuánto tiempo se guardan) | ❌ No | Hoy nada se borra (las bajas son lógicas). Hay que decir cuánto tiempo se conservan y qué pasa al terminar el ciclo |

Dos detalles del texto actual:

- Dice que la contraseña se guarda «cifrada». Técnicamente se guarda un **hash** (argon2id), que no se puede descifrar. «Protegida con un algoritmo que no permite recuperarla» es más exacto.
- Si algún estudiante es **menor de edad**, hace falta el consentimiento de su madre, padre o tutor.

### Recomendación

1. Confirmar con la profesora quién es el responsable y, con eso, qué ley aplica.
2. Que el equipo complete la tabla anterior. Lo más rápido es partir del aviso de privacidad que la universidad ya publica para sus sistemas y adaptarlo.
3. Corregir el texto del enlace en la página de inicio de sesión si la ley no es la LFPDPPP.
4. Cuando el texto esté listo, se pasa a `AvisoPrivacidad.tsx` y se quita la marca de borrador. Es un cambio pequeño.
