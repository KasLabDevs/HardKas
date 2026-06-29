import { describe, it, expect } from 'vitest';
import { toTxBuilderUtxo, toWalletQueryUtxo } from '../src/utxo-mapper.js';

describe('UTXO Mapper', () => {
    it('should map flat UTXO to TxBuilder Utxo', () => {
        const flat = {
            transactionId: "mock_tx_id",
            outputIndex: 1,
            amountSompi: 1000n,
            scriptPublicKey: "mock_script",
            address: "kaspa:address"
        };
        
        const builderUtxo = toTxBuilderUtxo(flat);
        
        expect(builderUtxo.outpoint.transactionId).toBe("mock_tx_id");
        expect(builderUtxo.outpoint.index).toBe(1);
        expect(builderUtxo.amountSompi).toBe(1000n);
        expect(builderUtxo.scriptPublicKey).toBe("mock_script");
        expect(builderUtxo.address).toBe("kaspa:address");
    });

    it('should map TxBuilder Utxo to flat UTXO', () => {
        const builderUtxo = {
            outpoint: {
                transactionId: "mock_tx_id_2",
                index: 2
            },
            address: "kaspa:address_2",
            amountSompi: 2000n,
            scriptPublicKey: "mock_script_2"
        };
        
        const flat = toWalletQueryUtxo(builderUtxo);
        
        expect(flat.transactionId).toBe("mock_tx_id_2");
        expect(flat.outputIndex).toBe(2);
        expect(flat.amountSompi).toBe(2000n);
        expect(flat.scriptPublicKey).toBe("mock_script_2");
        expect(flat.address).toBe("kaspa:address_2");
    });
});
