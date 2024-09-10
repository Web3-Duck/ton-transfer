import "@stdlib/deploy";

message(0x7362d09c) JettonTransferNotification {
    query_id: Int as uint64; // arbitrary request number
    amount: Int as coins; // amount of jettons to transfer
    sender: Address; // address of the sender of the jettons
    forward_payload: Slice as remaining; // optional custom payload
}

message(0x0f8a7ea5) JettonTransfer {
    query_id: Int as uint64; // arbitrary request number
    amount: Int as coins; // amount of jettons to transfer
    destination: Address; // address of the new owner of the jettons
    response_destination: Address; // address where to send a response with confirmation of a successful transfer and the rest of the incoming message Toncoins.
    custom_payload: Cell?; // optional custom payload
    forward_ton_amount: Int as coins; // the amount of nanotons to be sent to the destination address.
    forward_payload: Slice as remaining; // optional custom data that should be sent to the destination address.
}

message UpdateFee {
    new_fee: Int as coins; // new fee value
}

message Withdraw {
    amount: Int as coins; // amount of jettons to withdraw
}

contract MultiTransfer with Deployable {
    owner: Address;
    fee: Int = ton("0.01");
    
    const gasConsumption: Int = ton("0.002");
    const minTonsForStorage: Int = ton("0.01");
    
    init(owner: Address) {
        self.owner = owner;
    }

    receive(msg:UpdateFee){
        let ctx: Context = context(); // Check sender
        require(ctx.sender == self.owner, "Only owner can update fee");
        self.fee = msg.new_fee;
    }

    receive(msg:Withdraw){
        let ctx: Context = context(); // Check sender
        require(ctx.sender == self.owner, "Only owner can withdraw");
        send(SendParameters{
            to: ctx.sender,
            value: msg.amount,
            mode: SendIgnoreErrors,
            bounce: false,
            body: emptyCell()
        });
    }

    receive(msg: JettonTransferNotification) {
        let ctx: Context = context(); // Check sender
        let payload: Slice = msg.forward_payload;
        let remianValue: Int = ctx.value - self.gasConsumption - self.minTonsForStorage;
        let allCount: Int = 0;
        
        if (!payload.empty()) {
            allCount = payload.loadUint(64);  
        }

        let allConsume: Int = (allCount + 1) * ctx.readForwardFee() + (allCount + 1) * self.gasConsumption + self.minTonsForStorage + allCount * ton("0.04") + allCount * self.fee;
        require(remianValue > allConsume, "Not enough funds to transfer");
        remianValue = remianValue - allConsume;

        if (allCount > 0) {
            let emptySlice: Slice = emptySlice();           
            let topCell: Cell = payload.loadRef();
            let topSlice: Slice = topCell.asSlice();
            let commentCell: Cell = payload.loadRef();
            let commentSlice: Slice = commentCell.asSlice();
            let isEmpty: Bool = commentSlice.empty();
            let forwardAmount: Int = isEmpty ? 0 : ton("0.005");
            let forwardPayload: Slice = isEmpty ? emptySlice : commentSlice;
            let currentRef: Cell = topSlice.loadRef();
            let currentSlice: Slice = currentRef.asSlice();
            let i = 0;

            repeat(allCount) {
                let amount: Int = currentSlice.loadUint(64);
                let address: Address = currentSlice.loadAddress();
                i = i + 1;

                if (i % 9 == 0) {
                    let topRef: Cell = topSlice.loadRef();
                    topSlice = topRef.asSlice();
                    currentRef = topSlice.loadRef();
                    currentSlice = currentRef.asSlice();
                } else if (i % 3 == 0) {
                    currentRef = topSlice.loadRef();
                    currentSlice = currentRef.asSlice();
                }

                send(SendParameters{
                    to: ctx.sender,
                    value: ton("0.06"),
                    mode: SendIgnoreErrors,
                    bounce: false,
                    body: JettonTransfer{
                        query_id: msg.query_id,
                        amount: amount,
                        destination: address,
                        response_destination: msg.sender,
                        forward_ton_amount: forwardAmount,
                        forward_payload: forwardPayload
                    }.toCell()
                });
            }
        }

        if(allCount > 0){
            send(SendParameters{
            to: self.owner,
            value: allCount * self.fee,
            mode: SendIgnoreErrors | SendPayGasSeparately,
            bounce: false,
            body: "owner fee".asComment(),
        });
        }
     

        send(SendParameters{
            to: msg.sender,
            value: remianValue,
            mode: SendIgnoreErrors,
            bounce: false,
            body: emptyCell()
        });
    }

    get fun owner(): Address {
        return self.owner;
    }

    get fun fee(): Int {
        return self.fee;
    }
}