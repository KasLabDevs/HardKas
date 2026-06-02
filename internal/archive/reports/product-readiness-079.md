# Product Readiness - 0.7.13-alpha

## ¿HardKAS CLI está listo como alpha usable?
Sí, el CLI es estable. La arquitectura está modularizada y previene escapes de sandbox de forma estricta. Las validaciones semánticas protegen los comandos.

## ¿HardKAS SDK está listo como Node library?
El SDK es funcional para consultas de lectura, pero como se descubrió en Phase 7-C, el motor de `simulate` presenta una brecha de DX grave al exigir lectura de disco para inputs en memoria. Esto reduce su flexibilidad como librería pura.

## ¿Qué falta antes de React?
Es imperativo resolver la dependencia en disco del SDK. React no puede persistir artifacts de la misma forma que Node.js sin adaptadores en memoria.

## ¿Qué falta antes de 0.8?
Exponer acceso criptográfico low-level (`unsignedPayloadHash`, Kastj facade) para facilitar las migraciones de código legado.