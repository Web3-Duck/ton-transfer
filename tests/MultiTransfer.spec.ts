import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { MultiTransfer } from '../wrappers/MultiTransfer';
import '@ton/test-utils';
import { ExampleJettonMaster } from '../wrappers/JettonExample_ExampleJettonMaster';
import { ExampleJettonWallet } from '../build/JettonExample/tact_ExampleJettonWallet';
import { equal } from 'assert';

const storeAddresses = (addresses: any[]) => {
    const cells = [];
    let currentCell = beginCell();
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i].address;
        const amount = addresses[i].amount;
        if (i % 3 === 0 && i !== 0) {
            cells.push(currentCell.endCell());
            currentCell = beginCell().storeUint(amount, 64).storeAddress(address);
        } else {
            currentCell.storeUint(amount, 64).storeAddress(address);
        }
    }

    cells.push(currentCell.endCell());

    const cell = beginCell();

    cell.storeUint(addresses.length, 4);

    cells.forEach((c) => {
        cell.storeRef(c);
    });
    const slice = cell.endCell();
    return slice;
};

describe('MultiTransfer', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let simpleJetton: SandboxContract<ExampleJettonMaster>;
    let multiTransfer: SandboxContract<MultiTransfer>;
    let toWallet: SandboxContract<TreasuryContract>;

    const getTonBalance = async (address: Address) => {
        const contractInfo = await blockchain.getContract(address);
        return contractInfo.balance;
    };

    beforeAll(async () => {
        let cell = new Cell();

        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        toWallet = await blockchain.treasury('toWallet');

        await deployer.send({
            value: toNano('1000000000'),
            to: toWallet.address,
        });

        simpleJetton = blockchain.openContract(await ExampleJettonMaster.fromInit(deployer.address, cell));

        multiTransfer = blockchain.openContract(await MultiTransfer.fromInit(0n));

        await multiTransfer.send(
            deployer.getSender(),
            {
                value: toNano('10'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        await simpleJetton.send(
            deployer.getSender(),
            {
                value: toNano('1'),
            },
            'Mint:10000000000',
        );
    });

    it('should transfer', async () => {
        const deployerDataAddress = await simpleJetton.getGetWalletAddress(deployer.address);
        const deployerDataContract = blockchain.openContract(ExampleJettonWallet.fromAddress(deployerDataAddress));
        const toDataAddress = await simpleJetton.getGetWalletAddress(toWallet.address);
        const addresses = [];
        for (let i = 0; i < 12; i++) {
            addresses.push({ amount: 1n, address: toWallet.address });
        }
        const multiAmount = addresses.reduce((acc, { amount }) => acc + amount, 0n);
        const forward_payload = storeAddresses(addresses);

        await deployerDataContract.send(
            deployer.getSender(),
            {
                value: toNano('3'),
            },
            {
                $$type: 'JettonTransfer',
                amount: multiAmount,
                query_id: 1n,
                destination: multiTransfer.address,
                response_destination: deployer.address,
                forward_ton_amount: toNano(1),
                custom_payload: null,
                forward_payload: forward_payload.asSlice(),
            },
        );

        const toDataContract = await blockchain
            .openContract(ExampleJettonWallet.fromAddress(toDataAddress))
            .getGetWalletData();

        equal(toDataContract.balance, 12n, '余额不对');
    });
});
