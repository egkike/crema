
# Spec Driven Development

**SDD (Spec Driven Development)**, se refiere a un enfoque de desarrollo de software donde el **proceso está guiado por especificaciones** (specs) desde el inicio hasta la implementación del código.

Es un **método de desarrollo** centrado en crear y seguir **especificaciones detalladas** antes de escribir cualquier línea de código.

- **Enfoque**: El desarrollo se basa en una documentación clara y estructurada (especificaciones).
- **Proceso**:
    1. Se define un **spec** (especificación) que incluye requisitos funcionales, comportamiento, casos de uso, y validaciones.
    2. El equipo desarrolla basándose en este spec.
    3. Se generan pruebas automatizadas o manuales para verificar que el código cumple con el spec.
- **Ventajas**:
    - Reduce errores por malentendidos.
    - Facilita la colaboración entre product managers, diseñadores y desarrolladores.
    - Permite una mayor calidad y consistencia en el producto.
- **Ejemplo**: Un spec puede describir cómo debe funcionar un botón "Enviar" en una app:
    > "Al hacer clic, se envía el formulario, se muestra un mensaje de éxito, y se deshabilita el botón durante 3 segundos."

## PRD

PRD significa **Product Requirements Document** (Documento de Requisitos del Producto) . Es un documento clave que define las funcionalidades, características y comportamiento de un producto desde la perspectiva del usuario, sirviendo como guía para los equipos de desarrollo y diseño . Un buen PRD es claro, conciso y completo, incluyendo requisitos detallados, historias de usuario y métricas de éxito para alinear a todos los involucrados en el proyecto.

El PRD es el punto de partida del proceso. Define _qué_ debe hacer el producto desde la perspectiva del usuario.

Después de generar el **PRD (Product Requirements Document)**, los siguientes documentos clave que se suelen desarrollar antes de llegar al código son:

1. **User Stories**
    - Descripciones cortas y simples de las funcionalidades desde la perspectiva del usuario.
    - Ejemplo: _"Como usuario, quiero poder iniciar sesión con mi correo electrónico para acceder a mi cuenta."_
    - Sirven para desglosar los requisitos del PRD en tareas manejables.
2. **Technical Specification Document (TSD)**
    - Detalla cómo se implementará cada funcionalidad desde un punto de vista técnico.
    - Incluye arquitectura del sistema, tecnologías a usar, APIs, bases de datos, y flujos de datos.
    - Ayuda a alinear a desarrolladores, diseñadores y equipos de infraestructura.
3. **Wireframes y Mockups**
    - Representaciones visuales del diseño de la interfaz de usuario.
    - Pueden ser bocetos simples (wireframes) o versiones más detalladas (mockups).
    - Aseguran que el producto tenga una experiencia de usuario coherente.
4. **System Architecture Diagram**
    - Diagrama que muestra cómo se estructura el sistema (front-end, back-end, servicios externos, bases de datos, etc.).
    - Es útil para comunicar la arquitectura del sistema a todos los miembros del equipo.
5. **API Specification (si aplica)**
    - Documenta las interfaces de comunicación entre componentes del sistema.
    - Puede incluir endpoints, métodos HTTP, parámetros y respuestas esperadas.
    - A menudo se escribe en formato OpenAPI (anteriormente Swagger).
6. **Test Plan / Test Cases**
    - Define cómo se validarán las funcionalidades del producto.
    - Incluye casos de prueba unitarios, de integración y de aceptación.
    - Asegura que el software cumpla con los requisitos del PRD.
7. **Development Roadmap / Sprint Planning**
    - Plan de desarrollo que divide el trabajo en tareas, prioridades y fechas estimadas.
    - Puede ser organizado mediante metodologías ágiles como Scrum o Kanban.

Una vez que estos documentos están listos, el equipo de desarrollo comienza a escribir el código, siguiendo los diseños, especificaciones y pruebas definidas.

## 🔄 Flujo recomendado (completo):

1. **PRD** → Define los requisitos del producto.
2. **User Stories + Acceptance Criteria** → Desglosa los requisitos en tareas verificables.
3. **Wireframes / Mockups** → Define la experiencia de usuario.
4. **SDD / Technical Specification** → Define la arquitectura y diseño técnico.
5. **API Specs / Database Design** → Detalla las integraciones y estructuras de datos.
6. **Test Plan / Test Cases** → Define cómo se validará el sistema.
7. **Development Roadmap** → Organiza el trabajo en sprints o fases.
8. **Código + CI/CD** → Implementación y automatización.
9. **Monitoring & Documentation** → Mantenimiento y soporte.

## ✅ Conclusión:

- Para que el proceso esté **completo**, debe incluir **diseño, pruebas, planificación y documentación técnica**.
- Un enfoque **Spec Driven Development** debe incluir **especificaciones funcionales y técnicas**, pero también **pruebas, diseño y gestión del desarrollo**.

> 🔹 **En resumen**: El desarrollo completo requiere de un **ecosistema de documentos y procesos** que aseguren calidad, coherencia y alineación con los objetivos del producto.

