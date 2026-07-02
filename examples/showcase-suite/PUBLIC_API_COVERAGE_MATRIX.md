# Public API Coverage Matrix

| App | APIs Exercised |
|-----|----------------|
| CLI Studio | buildHardkasProgram<br>Command.parseAsync<br>parseHardkasConfig |
| Explorer Live | QueryStoreSqlite.getBlock<br>QueryStoreSqlite.getTransaction<br>MetricsProvider.getMetrics<br>LocalIndexerApi |
| Merchant Terminal | PaymentToolkit.createInvoice<br>PaymentToolkit.listInvoices<br>PaymentToolkit.processPayment<br>buildPaymentPlan<br>estimateMass<br>createMockUtxo |
| Mission Control | WalletToolkit.create<br>WalletToolkit.balance<br>WalletToolkit.send<br>KaspaRpcClient.connect<br>JsonWrpcKaspaClient |
| Silver Playground | SilverToolkit.open<br>SilverToolkit.templates<br>SilverToolkit.build<br>SilverToolkit.simulate<br>SilverToolkit.artifact<br>SilverToolkit.evidence |
| Time Travel Lab | SnapshotToolkit.open<br>SnapshotToolkit.create<br>SnapshotToolkit.branch<br>SnapshotToolkit.restore<br>SnapshotToolkit.diff<br>SnapshotToolkit.compare |
| Treasury Console | JobsToolkit.open<br>JobsToolkit.enqueue<br>JobsToolkit.getJob<br>JobsToolkit.resumePendingJobs |
| Wallet Pro | WalletToolkit.open<br>WalletToolkit.balance<br>WalletToolkit.history<br>WalletToolkit.sendSimulated<br>detectKaspaWallets<br>connectKaspaWallet |
