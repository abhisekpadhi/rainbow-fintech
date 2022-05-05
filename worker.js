const String = require('./utils');
const {randomUUID} = require('crypto');
const constants = require('./constants');
const {
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
    addNewUserAccountIdMapping,
    findHumanForDeposit,
    findHumanAtLocation,
    findFloatingRequest,
    getUserRequestById,
    updateTxnStatusToSuccess,
    createTxn,
    addLedgerEntry,
    getUserAccountByPhone,
    updateBucket,
    getBucketBalance,
    getCachedOtpForTxn
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
    console.log(`update balance for ${phone} ${op} ${money} ${note}`);
    const newId = randomUUID()

    // find phone to id mapping
    const accountMapping = await getAccountIdMapping(phone)
    const oldId = accountMapping['id']
    console.log(`account found: ${JSON.stringify(accountMapping)}`);

    // deactivate old userAccount record
    await deactivateUserAccount(accountMapping['id'])
    console.log(`old record deactivated`);
    const oldUserAccount = await getUserAccount(oldId);
    console.log(`oldData: ${JSON.stringify(oldUserAccount)}`)

    // write new userAccount data
    let balance = parseInt(oldUserAccount['balance'], 10)
    if (op === constants.op.credit) {
        balance += parseInt(money, 10)
    }
    if (op === constants.op.debit) {
        balance -= parseInt(money)
    }
    await addNewUserAccountRecord({...oldUserAccount, 'balance': balance, id: newId});
    console.log(`new userAccount record added with id ${newId}`);

    // add ledger entry
    await addLedgerEntry(phone, note, money, op, oldUserAccount['balance']);

    // update phone to id mapping
    await updateUserAccountIdMapping(accountMapping['phone'], newId)
    console.log(`accountIdMapping updated for phone ${phone} to ${newId}`);
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



// answer to floating cash
const handleYesNoType = async (who, response) => {
    if (response.toUpperCase() === 'YES') {
        // optional todo: if response is NO call retry find withdraw process
        return
    }
    // fetch the original request
    const floatingRequestFound = await findFloatingRequest(who)
    if (floatingRequestFound) {
        const originalRequest = await getUserRequestById(floatingRequestFound.id);
        const foundUserAccountIdMapping = await getAccountIdMapping(who)
        const foundHuman = await getUserAccount(foundUserAccountIdMapping['id']);
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

const handleSeeBalance = async (phone) => {
    const account = await getUserAccountByPhone(phone);
    if (account) {
        // send sms
        await sendSms(phone, account.balance);
    }
}

const handleReceiveDeposit = async (agent, howMuch, customer) => {
    console.log(`handleReceiveDeposit for agent ${agent} customer ${customer} money ${howMuch}`)
    await createTxn(
        agent,
        customer,
        constants.requestType.collect,
        howMuch,
        customer.toPhoneNumber(),
        agent.toPhoneNumber(),
    )
}

const handleBucket = async (who, bucketName, howMuch) => {
    await updateBucket(who, bucketName, howMuch);
}

const handleGetBucketBalance = async (who, bucketName) => {
    const balance = await getBucketBalance(who, bucketName);
    if (balance) {
        await sendSms(who, balance);
    }
}

const handleFloating = (who, howMuch) => {
    // todo: implement
}

const handleTransactionVerification = async (from, message) => {
    console.log(`handleTxnVerification, from: ${from} | message: ${message}`);
    if (message.split(' ').length === 2) {
        const txnId =  message.split(' ')[0]
        const userOtp =  message.split(' ')[1]
        const txn = await getTxn(txnId);
        if (txn) {
            const cachedOtp = await getCachedOtpForTxn(txnId);
            console.log(`cachedOtp: ${cachedOtp}`);
            console.log(`userOtp: ${userOtp}`);
            // txn verified
            if (cachedOtp === userOtp) {
                switch (txn.requestType) {
                    case constants.requestType.deposit:
                        await handleUpdateBalance(
                            txn['firstParty'],
                            constants.op.credit,
                            txn['money'],
                            `ATM deposit done, txnId ${txnId}`
                        );
                        await handleUpdateBalance(
                            txn['secondParty'],
                            constants.op.debit,
                            txn['money'],
                            `ATM deposit received, txnId ${txnId}`);
                        await updateTxnStatusToSuccess(txnId);
                        break;
                    case constants.requestType.withdraw:
                        await handleUpdateBalance(
                            txn['firstParty'],
                            constants.op.debit,
                            txn['money'],
                            `ATM withdraw done, txnId ${txnId}`
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
                        await handleUpdateBalance(
                            txn['secondParty'],
                            constants.op.credit,
                            txn['money'],
                            `Collected cash, txnId ${txnId}`);
                        break;
                    default:
                        console.log(`txn requestType ${txn.requestType} cannot be handled`);
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
            await handleRegisterNewAccount(
                sender.toPhoneNumberDbKey(),
                pan,
                name,
                location
            )
            return;
        }
        if (message.startsWith('FIND DEPOSIT')) {
            await handleFindDeposit(
                sender.toPhoneNumberDbKey(),
                message.replace('FIND DEPOSIT ', '').split(' ')[0],
                message.replace('FIND DEPOSIT ', '').split(' ')[1]
            )
            return;
        }
        if (message.startsWith('DEPOSIT')) {
            const howMuch = message.replace('DEPOSIT ', '').split(' ')[0]
            const secondParty = message.replace('DEPOSIT ', '').split(' ')[1]
            await handleDeposit(sender.toPhoneNumberDbKey(), howMuch, secondParty.toPhoneNumberDbKey())
            return;
        }
        if (message.startsWith('FIND WITHDRAW')) {
            await handleFindWithdraw(
                sender.toPhoneNumberDbKey(),
                message.replace('FIND WITHDRAW ', '').split(' ')[0],
                message.replace('FIND WITHDRAW ', '').split(' ')[1]
            )
            return;
        }
        if (message.startsWith('WITHDRAW')) {
            await handleWithdraw(
                sender.toPhoneNumberDbKey(),
                message.replace('WITHDRAW ', '').split(' ')[0],
                message.replace('WITHDRAW ', '').split(' ')[1].toPhoneNumberDbKey()
            )
            return;
        }
        if (message.toUpperCase().startsWith('YES') || message.toUpperCase().startsWith('NO')) {
            await handleYesNoType(
                sender.toPhoneNumberDbKey(),
                message.toUpperCase()
            );
            return;
        }

        if (message.startsWith('PAYMENT')) {
            const howMuch = message.replace('PAYMENT ', '').split(' ')[0]
            const customer = message.replace('PAYMENT ', '').split(' ')[1]
            await handlePayment(
                sender.toPhoneNumberDbKey(),
                howMuch,
                customer.toPhoneNumberDbKey()
            );
            return;
        }

        if (message.startsWith('TRANSFER')) {
            const howMuch = message.replace('TRANSFER ', '').split(' ')[0]
            const receiver = message.replace('TRANSFER ', '').split(' ')[1]
            await handleTransfer(
                sender.toPhoneNumberDbKey(),
                howMuch,
                receiver.toPhoneNumberDbKey()
            );
            return;
        }
        // account balance as well as bucket balance
        if (message.startsWith('BALANCE')) {
            await handleSeeBalance(sender);
            return;
        }
        // handle cash collection
        if (message.startsWith('RCVDEPOSIT')) {
            const howMuch = message.replace('RCVDEPOSIT ', '').split(' ')[0];
            const customer = message.replace('RCVDEPOSIT ', '').split(' ')[1];
            await handleReceiveDeposit(
                sender.toPhoneNumberDbKey(),
                howMuch,
                customer.toPhoneNumberDbKey()
            );
            return;
        }
        // get bucket balance
        if (message.startsWith('GET')) {
            await handleGetBucketBalance(
                sender.toPhoneNumberDbKey(),
                message.replace('GET ', '').split(' ')[0]
            );
            return;
        }
        // handle bucket balance
        if (message.startsWith('BUC')) {
            await handleBucket(
                sender.toPhoneNumberDbKey(),
                message.replace('BUC ', '').split(' ')[0],
                message.replace('BUC ', '').split(' ')[1]
            );
            return;
        }

        // for raising request to collect cash for account deposit
        if (message.startsWith('ACCOUNT')) {
            // todo: implement
            return;
        }
        // declare floating cash
        if (message.startsWith('FLOATING')) {
            // todo: implement
            return;
        }

        // otherwise the message will be transaction id and otp for verification
        await handleTransactionVerification(sender, message);
    }

    return {
        statusCode: 200,
        body: JSON.stringify('ok'),
    };
};
