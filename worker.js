const String = require('./utils');
const {cache, ddbDocClient} = require('./clients');
const {randomUUID} = require('crypto');
const constants = require('./constants');
const {
    generateOtp,
    generateUniqueId,
    constructCacheKeyForOtp,
    writeToDb,
    sendSms, deleteReadMessage,
} = require('./utils');
const {
    getAccountIdMapping,
    deactivateUserAccount,
    getUserAccount,
    addNewUserAccountRecord,
    updateUserAccountIdMapping,
    getTxn,
    addNewTxn,
    addNewUserAccountIdMapping,
    findHumanForDeposit,
    findHumanAtLocation,
    findFloatingRequest,
    getUserRequestById,
    updateTxnStatusToSuccess, createTxn
} = require("./dal");

const handleRegisterNewAccount = async (phone, pan, name, location) => {
    console.log(`registering new account for ${phone}, ${pan}, ${name}, ${location}`);
    const account = await getAccountIdMapping(phone)
    if (account === null) {
        const newId = randomUUID();
        await addNewUserAccountRecord({
            'phone': phone.toPhoneNumberDbKey(),
            'id': newId,
            'name': name,
            'loc': location,
            'pan': pan,
            'verification': 'soft',
            'balance': 0,
            'currentActive': true,
            'createdAt': Date.now(),
        })
        await addNewUserAccountIdMapping(phone, newId)
        console.log(`New account registered for phone: ${phone} account id: ${newId}`)
        await sendSms(phone, 'SUCCESS')
    } else {
        console.log(`user account for ${phone} already exists`)
    }
}

const handleUpdateBalance = async (phone, op, money, note) => {
    const newId = randomUUID()

    // find phone to id mapping
    const accountMapping = await getAccountIdMapping(phone)
    const oldId = accountMapping['id']
    console.log(`account found: ${JSON.stringify(accountMapping)}`);

    // deactivate old userAccount record
    await deactivateUserAccount(accountMapping['id'])
    console.log(`old record deactivated`);
    const oldUserAccount = getUserAccount(oldId);
    console.log(`oldData: ${JSON.stringify(oldUserAccount)}`)

    // write new userAccount data
    let balance = oldUserAccount['balance']
    if (op === constants.op.credit) {
        balance += money
    }
    if (op === constants.op.debit) {
        balance -= money
    }
    await addNewUserAccountRecord({...oldUserAccount, 'balance': balance, id: newId});
    console.log(`new userAccount record added with id ${newId}`);

    // add ledger entry
    await addLedgerEntry(phone, note, money, op, oldUserAccount['balance']);

    // update phone to id mapping
    await updateUserAccountIdMapping(accountMapping['phone'], newId)
    console.log(`accountIdMapping updated for phone ${phone} to ${newId}`);
}

const addLedgerEntry = async (whose, note, money, op, opening) => {
    const entry = {
        'phone': whose,
        'op': op,
        'note': note,
        'money': money,
        'openingBalance': opening,
        'createdAt': Date.now()
    }
    await writeToDb(constants.ledgerTable, entry);
    console.log(`ledger entry added: ${JSON.stringify(entry)}`);
}

const handleFindDeposit = async (whoRequested, howMuch, where) => {
    console.log(`find human to receive deposit from ${whoRequested} Rs.${howMuch} in ${where}`);
    const humanAtmFound = await findHumanForDeposit(howMuch, where)
    let status = 'requested';
    if (humanAtmFound) {
        // send sms response to requester
        await sendSms(
            whoRequested,
            `${humanAtmFound.name} ${humanAtmFound.phone}`
        );
        status = 'fulfilled';
    }
    // save the request
    await writeToDb(constants.requestTable, {
        id: randomUUID(),
        'phone': whoRequested,
        'requestType': constants.requestType.findDeposit,
        'where': where,
        'money': howMuch,
        'otherAccount': humanAtmFound.phone,
        'status': status,
        'extraInfo': '',
        'currentActive': true,
        'createdAt': Date.now()
    });
}

const handleDeposit = async (firstParty, howMuch, secondParty) => {
    console.log(`handleDeposit for ${firstParty} Rs.${howMuch} with ${secondParty}`);
    // optional todo: verification if requested user for deposit was same returned in find result
    // create new txn & save in db
    await createTxn(
        firstParty,
        secondParty,
        constants.requestType.deposit,
        howMuch,
        firstParty.toPhoneNumber(),
        secondParty.toPhoneNumber(),
    )
}

const handleFindWithdraw = async (whoRequested, howMuch, where) => {
    // blast out sms to nearby people asking for floating cash
    const humanAtmFound = await findHumanAtLocation(location)
    let status = 'requested';
    if (humanAtmFound) {
        await sendSms(humanAtmFound['phone'], `${howMuch} FLOATING?`)
        status = 'fulfilled'
    }
    // save the request in db
    const id = randomUUID()
    await writeToDb(constants.requestTable, {
        id,
        'phone': whoRequested,
        'requestType': constants.requestType.findWithdraw,
        'where': where,
        'money': howMuch,
        'otherAccount': humanAtmFound.phone,
        'status': status,
        'extraInfo': '',
        'currentActive': true,
        'createdAt': Date.now()
    });
    await writeToDb(constants.floatingTable, {
        phone: humanAtmFound.phone,
        id,
    });
}

const handleWithdraw = async (firstParty, howMuch, secondParty) => {
    await createTxn(
        firstParty,
        secondParty,
        constants.requestType.withdraw,
        howMuch,
        secondParty.toPhoneNumber(),
        firstParty.toPhoneNumber(),
    )
}

const handleFloating = (who, howMuch) => {
    // todo: implement
}

// answer to floating cash
const handleYesNoType = async (who, response) => {
    if (response.toUpperCase() === 'YES') {
        // todo: if response is NO call retry find withdraw process
        return
    }
    // fetch the original request
    const floatingRequestFound = await findFloatingRequest(who)
    if (floatingRequestFound) {
        const originalRequest = getUserRequestById(floatingRequestFound.id);
        const foundUserAccountIdMapping = getAccountIdMapping(who)
        const foundHuman = getUserAccount(foundUserAccountIdMapping['id']);
        // send sms to requester
        await sendSms(
            originalRequest['phone'],
            `${foundHuman['name']} ${who}`
        )
    }
}

const handlePayment = async (seller, howMuch, buyer) => {
    await createTxn(
        seller,
        buyer,
        constants.requestType.pay,
        howMuch,
        buyer.toPhoneNumber(),
        seller.toPhoneNumber(),
    )
}

const handleTransfer = async (sender, howMuch, receiver) => {
    await createTxn(
        sender,
        receiver,
        constants.requestType.transfer,
        howMuch,
        sender.toPhoneNumber(),
        receiver.toPhoneNumber(),
    )
}

const handleSeeBalance = () => {}

const handleSip = () => {}

const handleAccountDepositCashCollection = () => {}


const handleTransactionVerification = async (from, message) => {
    if (message.split(' ').length === 2) {
        const txnId =  message.split(' ')[0]
        const userOtp =  message.split(' ')[1]
        const txn = getTxn(txnId);
        if (txn) {
            const key = constructCacheKeyForOtp(txnId);
            const cachedOtp = await cache.get(key)
            // txn verified
            if (cachedOtp === userOtp) {
                switch (txn.requestType) {
                    case constants.requestType.deposit:
                        await handleUpdateBalance(
                            txn['firstParty'],
                            constants.op.credit,
                            txn['money'],
                            `ATM deposit, txnId ${txnId}`
                        );
                        await handleUpdateBalance(
                            txn['secondParty'],
                            constants.op.debit,
                            txn['money'],
                            `received ATM deposit, txnId ${txnId}`);
                        await updateTxnStatusToSuccess(txnId);
                        break;
                    case constants.requestType.withdraw:
                        await handleUpdateBalance(
                            txn['firstParty'],
                            constants.op.debit,
                            txn['money'],
                            `ATM withdraw, txnId ${txnId}`
                        );
                        await updateTxnStatusToSuccess(txnId);
                        break;
                    case constants.requestType.pay:
                        await handleUpdateBalance(
                            txn['firstParty'],
                            constants.op.credit,
                            txn['money'],
                            `Payment received, txnId ${txnId}`
                        );
                        await handleUpdateBalance(
                            txn['secondParty'],
                            constants.op.debit,
                            txn['money'],
                            `Payment done, txnId ${txnId}`);
                        await updateTxnStatusToSuccess(txnId);
                        break;
                    case constants.requestType.transfer:
                        await handleUpdateBalance(
                            txn['firstParty'],
                            constants.op.debit,
                            txn['money'],
                            `Transfer done, txnId ${txnId}`
                        );
                        await handleUpdateBalance(
                            txn['secondParty'],
                            constants.op.credit,
                            txn['money'],
                            `Transfer received, txnId ${txnId}`);
                        await updateTxnStatusToSuccess(txnId);
                        break;
                    case constants.requestType.collect:
                        break;
                    default:
                        break;
                }

            }
        }
    }
}

// check README.md for event schema - message received from SQS
exports.handler = async (event) => {
    Object.freeze(event);

    console.log(`received message from sqs: ${JSON.stringify(event)}`)

    // delete messages from sqs
    await deleteReadMessage(event['Records'])

    // process received messages
    for (const record of event['Records']) {
        const body = JSON.parse(record.body);
        const sender = body['sender'];
        const message = body['content'].replace('NLLG7 ', ''); // strip the textlocal sms prefix
        console.log(`sender: ${sender} | parsed message: ${message}`)
        if (message.startsWith('REGISTER')) {
            const splitted = message.replace('REGISTER ', '').split(' ')
            const pan = splitted[0]
            const name = splitted[1]
            const location = splitted[2]
            await handleRegisterNewAccount(sender, pan, name, location)
        }
        if (message.startsWith('FIND DEPOSIT')) {
            await handleFindDeposit(
                sender,
                message.replace('FIND DEPOSIT ').split(' ')[0],
                message.replace('FIND DEPOSIT ').split(' ')[1]
            )
            return;
        }
        if (message.startsWith('DEPOSIT')) {
            const howMuch = message.replace('DEPOSIT ').split(' ')[0]
            const secondParty = message.replace('DEPOSIT ').split(' ')[1]
            await handleDeposit(sender.toPhoneNumberDbKey(), howMuch, secondParty.toPhoneNumberDbKey())
            return;
        }
        if (message.startsWith('FIND WITHDRAW')) {
            await handleFindWithdraw(
                sender,
                message.replace('FIND WITHDRAW ').split(' ')[0],
                message.replace('FIND WITHDRAW ').split(' ')[1]
            )
            return;
        }
        if (message.startsWith('WITHDRAW')) {
            await handleWithdraw(
                sender.toPhoneNumberDbKey(),
                message.replace('WITHDRAW ').split(' ')[0],
                message.replace('WITHDRAW ').split(' ')[1].toPhoneNumberDbKey()
            )
            return;
        }
        if (message.toUpperCase().startsWith('YES') || message.toUpperCase().startsWith('NO')) {
            await handleYesNoType(sender, message.toUpperCase());
            return;
        }

        if (message.startsWith('PAYMENT')) {
            const howMuch = message.replace('PAYMENT ').split(' ')[0]
            const customer = message.replace('PAYMENT ').split(' ')[1]
            await handlePayment(sender.toPhoneNumberDbKey(), howMuch, customer.toPhoneNumberDbKey());
            return;
        }

        if (message.startsWith('TRANSFER')) {
            const howMuch = message.replace('TRANSFER ').split(' ')[0]
            const receiver = message.replace('TRANSFER ').split(' ')[1]
            await handleTransfer(sender.toPhoneNumberDbKey(), howMuch, receiver.toPhoneNumberDbKey());
            return;
        }

        // account balance as well as bucket balance
        if (message.startsWith('BALANCE')) {
            // todo: implement
            return;
        }

        if (message.startsWith('GET')) {
            // todo: implement
            return;
        }

        if (message.startsWith('ACCOUNT')) {
            // todo: implement
            return;
        }

        if (message.startsWith('RECEIVING')) {
            // todo: implement
            return;
        }

        if (message.startsWith('FLOATING')) {
            // todo: implement
            return;
        }

        // otherwise the message will be transaction id and otp for verification
        // todo: handle
        await handleTransactionVerification(sender, message)
    }

    return {
        statusCode: 200,
        body: JSON.stringify('ok'),
    };
};
