# Lab 09.5 — Clean Toolkit Rebuild Pass

## Objective
To rebuild the Lab 09 ecosystem, strictly eliminating all temporary workarounds (specifically the `invoiceState` Map and manual instantiation of `JobStoreJson`) by leveraging the new domain state capabilities added in P41.

## Success Metrics

1. **Zero Internal Imports**:
   - The application purely imports `WalletToolkit`, `PaymentToolkit`, `IndexerToolkit`, and `JobsToolkit`. No infrastructure imports remain.

2. **Zero Workarounds**:
   - The in-memory `Map` used to persist invoices has been deleted.
   - The Oracle and simulation APIs now successfully rely on `payment.getInvoice()`, `payment.simulatePay()`, and `payment.stats()`.

3. **Jobs Encapsulation**:
   - `new JobRunner({ store: new JobStoreJson(...) })` has been successfully replaced by `JobsToolkit.open({ storePath: ... })`.

4. **Ergonomics Validated**:
   - The API endpoints are extremely declarative. We can now confidently state that HardKAS possesses a highly ergonomic, stateful toolkit layer capable of rapidly bootstrapping complex Kaspa applications without forcing developers to manage JSON stores or projection maps manually.

## Conclusion
The framework has reached a state of maturity where complex, real-world Kaspa backend orchestration is reduced to simple, declarative function calls over state-aware toolkits. HardKAS is now ready for a stabilization, documentation, and templating phase.
