# Client Reference

The `@hardkas/client` package provides React hooks.

## `HardkasProvider`
Wrap your React application to inject the isomorphic SDK.

```jsx
import { HardkasProvider } from '@hardkas/client';
import { HardkasSchemas } from "@hardkas/artifacts";

function App() {
  return (
    <HardkasProvider network="simulated">
      <WalletUI />
    </HardkasProvider>
  );
}
```

> [!NOTE]
> The client SDK performs planning and artifact generation exclusively in the browser context. It does not require a Node.js backend.
