import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, fromNano, Slice, toNano } from '@ton/core';
import { MultiTransfer } from '../wrappers/MultiTransfer';
import '@ton/test-utils';
import { ExampleJettonMaster } from '../wrappers/JettonExample_ExampleJettonMaster';
import { ExampleJettonWallet } from '../build/JettonExample/tact_ExampleJettonWallet';

const storeAddresses = (addresses: any[]) => {
    let allCount = addresses.length;
    let refs = [];
    let cells = [];
    let currentCell = beginCell();
    let currentRef = beginCell();

    for (let i = 0; i < addresses.length; i++) {
        let currentCount = i + 1;
        const address = addresses[i].address;
        const amount = addresses[i].amount;
        currentCell.storeUint(amount, 64).storeAddress(address);
        if (currentCount === allCount) {
            currentCell.endCell();
            cells.push(currentCell);
        } else if (currentCount % 3 === 0) {
            currentCell.endCell();
            cells.push(currentCell);
            currentCell = beginCell();
        }
    }

    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        currentRef.storeRef(cell);
        if ((i + 1) % 3 === 0) {
            refs.unshift(currentRef);
            currentRef = beginCell();
        } else if (i === cells.length - 1) {
            refs.unshift(currentRef);
        }
    }

    let current = refs[0].endCell();
    for (let i = 0; i < refs.length - 1; i++) {
        let nextRef = refs[i + 1];
        nextRef.storeRef(current);
        current = nextRef.endCell();
    }
    const commentCell = beginCell()
        .storeBit(1)
        .storeRef(
            beginCell()
                .storeUint(0, 32) // 预留32位用于标识
                .storeStringTail('你好啊') // 存储评论内容
                .endCell(),
        )
        .endCell();

    let topCurrentCell = beginCell().storeUint(allCount, 64).storeRef(current).storeMaybeRef(commentCell).endCell();

    return topCurrentCell;
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

        multiTransfer = blockchain.openContract(await MultiTransfer.fromInit(deployer.address));

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
        const allAmount = 100;
        for (let i = 0; i < allAmount; i++) {
            addresses.push({
                amount: BigInt(1),
                address: toWallet.address,
            });
        }
        const multiAmount = addresses.reduce((acc, { amount }) => acc + amount, 0n);
        const forward_payload = storeAddresses(addresses);

        await deployerDataContract.send(
            deployer.getSender(),
            {
                value: toNano('30'),
            },
            {
                $$type: 'JettonTransfer',
                amount: multiAmount,
                query_id: 1n,
                destination: multiTransfer.address,
                response_destination: deployer.address,
                forward_ton_amount: toNano(allAmount * 0.08),
                custom_payload: null,
                forward_payload: forward_payload.asSlice(),
            },
        );

        const toDataContract = await blockchain
            .openContract(ExampleJettonWallet.fromAddress(toDataAddress))
            .getGetWalletData();

        expect(toDataContract.balance).toBe(BigInt(allAmount));
    });
});
