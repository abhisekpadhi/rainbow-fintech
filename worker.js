const {cache} = require('./clients');
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
    updateUserAccountIdMapping, getTxn, addNewTxn, addNewUserAccountIdMapping
} = require("./dal");

cache.connect().then(_ => { console.log(`cache connected`)});

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

const handleFindDeposit = async (who, howMuch, where) => {
    console.log(`findDeposit for ${who} Rs.${howMuch} in ${where}`);
    const params = {
        TableName: constants.accountTable,
        Limit: 2,
        FilterExpression: "balance >= :balance AND loc = :loc",
        ExpressionAttributeValues: {
            ":balance": {'N': howMuch},
            ":loc": {'S': where}
        }
    }
    //todo: check cache before scanning db

    // todo: migrate to  and to dal
    // await ddb.scan(params).promise().then(async (res) => {
    //     if (res['Items'].length > 0) {
    //         console.log(`search results: ${JSON.stringify(res['Items'])}`)
    //         // cache result
    //         const key = `deposit:${howMuch}:${where}`;
    //         await cache.set(key, JSON.stringify(res.Items)).then(_ => {console.log(`cache set ${key}`)});
    //         // send sms response to requester
    //         sendSms(res['Item'].phone, `${res['Item'].name} ${res['Item'].phone}`)
    //         // save the request
    //         await writeToDb(constants.requestTable, {
    //             'phone': {'S': who},
    //             'requestType': {'S': constants.requestType.findDeposit},
    //             'where': {'S': where},
    //             'money': {'N': howMuch},
    //             'otherAccount': {'S': ''},
    //             'status': {'S': 'requested'},
    //             'extraInfo': {'S': ''},
    //             'currentActive': {'BOOL': true},
    //             'createdAt': {'N': Date.now()}
    //         })
    //     }
    // });
}

const handleDeposit = async (firstParty, howMuch, secondParty) => {
    console.log(`handleDeposit for ${firstParty} Rs.${howMuch} with ${secondParty}`);
    // optional todo: verification if requested user for deposit was same returned in find result
    // create new txn
    const txnId = generateUniqueId(constants.txnUidSize, (id) => getTxn(id) === null)
    await addNewTxn({
        'txnId': txnId,
        'firstParty': firstParty,
        'secondParty': secondParty.length === 10 ? `91${secondParty}` : secondParty,
        'requestType': constants.requestType.deposit,
        'money': howMuch,
        'status': constants.txnStatus.created,
        'createdAt': Date.now(),
        'currentActive':  true,
    });
    // send txn id
    sendSms(firstParty.toPhoneNumber(), txnId)
    // generate otp
    const otp = generateOtp()
    const key = constructCacheKeyForOtp(txnId)
    // save otp in cache
    await cache.set(key, otp, {EX: constants.otpExpiryInSeconds}).then(_ => {
        console.log(`cache set for key ${key}`);
    });
    // send otp
    sendSms(secondParty.toPhoneNumber(), otp)
}

const handleWithdraw = () => {

}

const handleRegisterNewAccount = async (phone, pan, name, location) => {
    console.log(`registering new account for ${phone}, ${pan}, ${name}, ${location}`);
    const account = await getAccountIdMapping(phone)
    if (account === null) {
        const newId = randomUUID();
        await addNewUserAccountRecord({
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
        console.log(`new account registered for phone: ${phone} account id: ${newId}`)
        await sendSms(phone, 'SUCCESS')
    } else {
        console.log(`user account for ${phone} already exists`)
    }
}

const handleFloating = () => {}

// answer to floating cash
const handleYesNoType = () => {}

const handlePayment = () => {}

const handleTransfer = () => {}

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
                        await handleUpdateBalance(txn['firstParty'], constants.op.credit, txn['money'], `ATM deposit, txnId ${txnId}`)
                        await handleUpdateBalance(txn['secondParty'], constants.op.debit, txn['money'], `received ATM deposit, txnId ${txnId}`)
                        break;
                    case constants.requestType.collect:
                        break;
                    case constants.requestType.withdraw:
                        break;
                    case constants.requestType.pay:
                        break;
                    case constants.requestType.transfer:
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
    console.log(`received message from sqs: ${JSON.stringify(event)}`)

    // delete messages from sqs
    await deleteReadMessage(event['Records'])

    // process received messages
    event['Records'].forEach(record => {
        const body = JSON.parse(record.body);
        const sender = body['sender'];
        const message = body['content'].replace('NLLG7 ', ''); // strip the textlocal sms prefix
        console.log(`sender: ${sender} | parsed message: ${message}`)
        if (message.startsWith('REGISTER')) {
            const splitted = message.replace('REGISTER ', '').split(' ')
            const pan = splitted[0]
            const name = splitted[1]
            const location = splitted[2]
            handleRegisterNewAccount(sender, pan, name, location)
        }
        if (message.startsWith('FIND DEPOSIT')) {
            handleFindDeposit(
                sender,
                message.replace('FIND DEPOSIT ').split(' ')[0],
                message.replace('FIND DEPOSIT ').split(' ')[1]
            )
            return;
        }
        if (message.startsWith('DEPOSIT')) {
            const howMuch = message.replace('DEPOSIT ').split(' ')[0]
            const secondParty = message.replace('DEPOSIT ').split(' ')[1]
            handleDeposit(sender, howMuch, secondParty)
            return;
        }

        if (message.startsWith('WITHDRAW')) {
            // todo: implement
            return;
        }

        if (message.startsWith('FLOATING')) {
            // todo: implement
            return;
        }

        if (message.startsWith('PAYMENT')) {
            // todo: implement
            return;
        }

        if (message.startsWith('TRANSFER')) {
            // todo: implement
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

        // otherwise the message will be transaction id and otp for verification
        // todo: handle
        handleTransactionVerification(sender, message)
    })

    return {
        statusCode: 200,
        body: JSON.stringify('ok'),
    };
};
