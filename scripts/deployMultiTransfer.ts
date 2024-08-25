import { toNano } from '@ton/core';
import { MultiTransfer } from '../wrappers/MultiTransfer';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const multiTransfer = provider.open(await MultiTransfer.fromInit(provider.sender().address!));

    await multiTransfer.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(multiTransfer.address);
}
