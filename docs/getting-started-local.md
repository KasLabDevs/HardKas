# Getting Started: Local Development with HardKAS

Esta guía te llevará desde una instalación limpia hasta tener un entorno de desarrollo full-stack (L1/L2) funcionando localmente.

## 1. Instalación
Instala la CLI de HardKAS de forma global:

```bash
pnpm install -g @hardkas/cli
```

## 2. Diagnóstico del Entorno
Ejecuta el "Dev Doctor" para verificar que tienes las dependencias necesarias y que tus nodos locales son accesibles.

```bash
hardkas dev doctor
```

## 3. Configuración Local (Wizard)
El asistente te guiará en la creación de cuentas de desarrollo y la configuración inicial del entorno local.

```bash
hardkas local wizard
```

## 4. Gestión de Sesiones
Crea una sesión para vincular tu identidad de Kaspa (L1) con tu identidad de Igra (L2). Esto permite que HardKAS resuelva automáticamente las direcciones en todos los comandos.

```bash
hardkas session create my-dev-session --l1 alice --l2 bob
hardkas session use my-dev-session
```

## 5. El Cockpit Dashboard
Lanza la consola visual para monitorizar balances, salud de la red y eventos en tiempo real.

```bash
hardkas dashboard
```

## 6. Integración con el Navegador
Desde el Cockpit, puedes:
- **MetaMask**: Sincronizar tu cuenta L2 y cambiar a la red local de Igra.
- **KasWare**: Sincronizar tu cuenta L1 de Kaspa.
- **WalletConnect Sandbox**: Probar flujos de emparejamiento móvil de forma local.

## 7. Simulación de Bridge
Prueba flujos de entrada L1 -> L2 sin gastar activos reales:

```bash
hardkas bridge local plan --amount 100
```

## 8. Desarrollo con React
Utiliza `@hardkas/react` en tu aplicación para consumir el estado del runtime local de HardKAS de forma automática.

```tsx
import { useHardKasSession, useKaspaBalance } from "@hardkas/react";

function MyComponent() {
  const { data: session } = useHardKasSession();
  const { data: balance } = useKaspaBalance();
  
  return <div>Wallet: {session?.l1.wallet} | Balance: {balance?.toString()}</div>;
}
```

---

> [!IMPORTANT]
> HardKAS es un **Sistema Operativo de Desarrollo Local Determinista**. Está diseñado para la iteración rápida y segura en tu máquina, no para la custodia de activos en redes de producción.
