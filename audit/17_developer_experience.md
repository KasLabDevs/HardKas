# Auditoría de Developer Experience (DX) - Fase 7

## Resumen Ejecutivo
Se realizaron dos recorridos principales para evaluar la fricción en la Developer Experience (DX) usando el estado actual de la rama para la Fase 7 (`0.11.4-alpha`). En ambos casos, el framework falla al ser consumido fuera del monorepo debido a cómo se manejan y empaquetan las dependencias (el clásico problema de la resolución de dependencias `workspace:*` de pnpm).

## Recorrido 1: SDK Mínimo (Instalación Manual)

**Objetivo:** Empaquetar `@hardkas/sdk`, instanciar un directorio vacío, instalar el SDK vía tarball y levantar una instancia de `HardKAS`.
**Directorio de prueba:** `C:\Temp\hardkas-test`

### Pasos ejecutados:
1. `pnpm build` en la raíz (Falló `@hardkas/wallet-adapter` pero los paquetes base se construyeron).
2. `pnpm pack` en `packages/sdk`, generando `hardkas-sdk-0.11.4-alpha.tgz`.
3. Creación de entorno con `npm init -y`.
4. Instalación del tarball: `npm install C:\...\hardkas-sdk-0.11.4-alpha.tgz`.

### Resultado y Taxonomía de Bloqueo
- **Estado:** ❌ FALLO (Bloqueante)
- **Error:** `npm error notarget No matching version found for @hardkas/accounts@0.11.4-alpha.`
- **Causa:** El paquete `@hardkas/sdk` tiene dependencias declaradas hacia otros paquetes locales (ej. `@hardkas/accounts`) que no están publicados en el registry público de npm y no se resuelven automáticamente a partir de un empaquetado simple con `pnpm pack`.

## Recorrido 2: Proyecto Canónico `wallet-backend` (Scaffolding CLI)

**Objetivo:** Usar el CLI de HardKAS para instanciar el template oficial de `wallet-backend` e instalar sus dependencias.
**Directorio de prueba:** `C:\Temp\hardkas-test-2`

### Pasos ejecutados:
1. Ejecución del CLI: `node packages\cli\dist\index.js create wallet-backend C:\Temp\hardkas-test-2`
2. El CLI generó exitosamente los archivos a partir del template.
3. Ejecución de `npm install` en el nuevo directorio.

### Resultado y Taxonomía de Bloqueo
- **Estado:** ❌ FALLO (Bloqueante)
- **Error:** `npm error Unsupported URL Type "workspace:": workspace:*`
- **Causa:** Los templates en el repositorio incluyen dependencias declaradas explícitamente con el protocolo `workspace:*`. Cuando un usuario final (fuera del monorepo) intenta instalar estas dependencias, gestores como npm (o incluso pnpm en modo standalone) fallan al no reconocer el protocolo o no estar dentro de un `pnpm-workspace.yaml`.

## Archivos modificados y artefactos creados temporalmente
- `C:\Temp\hardkas-test` (con `package.json` y `index.ts`)
- `C:\Temp\hardkas-test-2` (con la salida del comando `create wallet-backend`)
- En el monorepo: artefactos de build y `hardkas-sdk-0.11.4-alpha.tgz`

## Conclusión y Próximos Pasos (Builder Labs)
Las aplicaciones dictan que el SDK y los templates **deben poder consumirse**. Para resolver estos problemas antes de validar con usuarios reales:
1. **Publicación o CLI inteligente:** Si se desea probar localmente sin registry, el CLI (`create`) debería encargarse de resolver y empaquetar recursivamente las dependencias locales o inyectar las dependencias empaquetadas (bundles).
2. **Templates sin `workspace:*`:** Los paquetes de template no pueden contener la sintaxis `workspace:*` cuando se exponen a consumidores finales. Durante la fase de `create`, el CLI debería reemplazar `workspace:*` por las versiones fijas (`0.11.4-alpha`) asumiendo que eventualmente se publicarán en un registry (o en un registry local como Verdaccio durante el testing).
3. **Distribución unificada (opcional):** Explorar compilar el SDK como un bundle (esbuild/tsup sin external dependencias del propio monorepo) si la meta es distribución de un solo paquete local (menos recomendado a largo plazo pero útil para testar).
