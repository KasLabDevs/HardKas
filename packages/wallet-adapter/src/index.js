export async function detectKaspaWallets(adapters) {
    return {
        adapters: adapters.filter((adapter) => adapter.installed)
    };
}
export async function connectKaspaWallet(options) {
    const installed = options.adapters.filter((adapter) => adapter.installed);
    if (installed.length === 0) {
        throw new Error("No compatible Kaspa wallet provider was detected.");
    }
    const selected = options.preferredWalletId === undefined
        ? installed[0]
        : installed.find((adapter) => adapter.id === options.preferredWalletId);
    if (!selected) {
        throw new Error(`Wallet provider not found: ${options.preferredWalletId}`);
    }
    const account = await selected.connect({ networkId: options.networkId });
    if (options.networkId && account.networkId !== options.networkId) {
        throw new Error(`Wallet connected to ${account.networkId}, expected ${options.networkId}`);
    }
    return selected;
}
