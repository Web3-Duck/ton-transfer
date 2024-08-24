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

contract MultiTransfer with Deployable {
    id: Int as uint32;

    init(id: Int) {
        self.id = id;
    }

    receive(msg: JettonTransferNotification) {
        let payload: Slice = msg.forward_payload;
        if (!payload.empty()) {
            let ctx: Context = context(); // Check sender
            let emptySlice: Slice = emptySlice();
            let allCount: Int = payload.loadUint(4);
            let countIndex: Int = 0;
            let currentRef: Cell = payload.loadRef();
            let currentSlice: Slice = currentRef.asSlice();
            repeat (allCount) {
                if (countIndex != 0 && countIndex % 3 == 0) {
                    currentRef = payload.loadRef();
                    currentSlice = currentRef.asSlice();
                }
                let amount: Int = currentSlice.loadUint(64);
                let toAddress: Address = currentSlice.loadAddress();
                countIndex = countIndex + 1;
                send(SendParameters{
                    to: ctx.sender,
                    value: ton("0.04"),
                    mode: SendIgnoreErrors,
                    bounce: false,
                    body: JettonTransfer{
                        query_id: msg.query_id,
                        amount: amount,
                        destination: toAddress,
                        response_destination: msg.sender,
                        custom_payload: null,
                        forward_ton_amount: 0,
                        forward_payload: emptySlice
                    }.toCell()
                });
            }
        }

        send(SendParameters{
            to: msg.sender,
            value: 0,
            mode: SendRemainingBalance,
            bounce: false,
            body: emptyCell()
        });
    }

    get fun id(): Int {
        return self.id;
    }
}