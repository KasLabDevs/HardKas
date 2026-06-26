# Predicted Friction Points

- The `capabilitiesApi` might be inconsistently named or lack full types.
- Future/Experimental APIs like `zk` or `vprogs` might not be exposed on the facade at all.

## Actual Friction Encounters

1. **Facade Discovery**: Discovering APIs like `sdk.capabilitiesApi.get()` instead of `.getCapabilities()`, and `sdk.l2.listProfiles()` instead of `.status()`, took trial and error because IDE autocompletion didn't make the signature obvious in my initial attempt.
2. **Untyped Beta Modules**: `sdk.zk` and `sdk.vprogs` *are* exposed on the Hardkas runtime instance, but their TypeScript types are missing from `Hardkas` interface in `index.ts`. I had to cast `(sdk as any).zk` to access them. They need to be formally added to the SDK facade interface to have type support.
