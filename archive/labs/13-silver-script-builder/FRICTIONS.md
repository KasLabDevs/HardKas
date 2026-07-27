# Lab 13: Silver Script Builder Frictions

Durante la construcción del Lab 13 (Silver Script Builder), nos vimos obligados a implementar todo el ciclo de vida de un script en Kaspa desde cero utilizando un servidor Fastify, debido a la ausencia de un `SilverToolkit` en HardKAS. 

Las carencias (fricciones) encontradas fueron severas:

1. **No hay `silver.template()`**
   Tuvimos que leer archivos `.txt` manualmente desde disco (`src/templates`). No existe un registro estandarizado de templates (ej. `op-true`, `htlc`) embebido en el framework.
2. **No hay `silver.compileAndValidate()`**
   Tuvimos que recurrir a mocks explícitos (`mockCompiler()`) utilizando un hash genérico, ya que el SDK no provee un binding al compilador oficial de Silver ni validaciones estáticas (como contar OP_CODES o calcular el tamaño en bytes exacto).
3. **No hay Lifecycle claro de Artefactos de Script**
   Tuvimos que generar nuestro propio almacenamiento en memoria (`fakeStorage`) y estructurar el JSON a mano. Un script compilado debería ser un artefacto estandarizado de HardKAS.
4. **No hay `spendPlan` ergonómico para scripts**
   En `tx-builder`, no hay manera automatizada de calcular el *mass* de un script arbitrario a menos que lo sepamos de antemano. Tuvimos que crear un `mockSpendPlanner()` que asume costes hardcodeados.
5. **No hay un `simulator result` normalizado**
   Tuvimos que crear `mockVmSimulator()`. En el futuro, la simulación debería devolver un objeto estructurado que muestre el *trace* de ejecución, *gas/mass consumido* y éxito/fracaso, conectándose al simulador real de Kaspa o a un node-runner local.
6. **No hay Evidence directa para script flows**
   Tuvimos que ensamblar el JSON de evidencia a mano, mezclando el artefacto compilado y el resultado de la simulación. En HardKAS, la evidencia de una simulación debería ser automática (ej. `silver.evidence()`).
7. **No hay Registry de templates integrado**
   Cada desarrollador tendría que mantener sus propios fragmentos y variables (`<pubkey>`, `<locktime>`). Se necesita una forma ergonómica de inyectar estos parámetros.
8. **Claims Categóricas (El Riesgo Mayor)**
   En nuestro código del Lab 13, cada respuesta de la API tuvo que ser forzada a incluir:
   ```json
   "claims": {
       "realSilverCompiler": false,
       "vmConsensusEquivalence": false,
       "mainnetReady": false,
       "simulatedOnly": true,
       "productionSafe": false
   }
   ```
   Sin un toolkit oficial, los desarrolladores podrían usar simuladores de terceros que den falsas garantías de que el script pasará las reglas de consenso de Mainnet. HardKAS debe adueñarse de estas *claims* para garantizar la seguridad.

**Conclusión:**
Construir dApps o herramientas basadas en contratos/scripts sobre Kaspa actualmente requiere demasiada integración manual y un falso sentido de seguridad. La extracción de un `SilverToolkit` (P47.1) está totalmente justificada.
