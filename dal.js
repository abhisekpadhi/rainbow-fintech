const {ddbDocClient, cache} = require('./clients');
const constants = require('./constants');
const {writeToDb, generateUniqueId, sendSms, generateOtp, constructCacheKeyForOtp} = require('./utils');

const getAccountIdMapping = async (phone) => {
    console.log(`gettingAccountIdMapping for ${phone}, tbl: ${constants.userAccountIdMappingTable}`);
    const data = await ddbDocClient.get({
        TableName: constants.userAccountIdMappingTable,
        Key: { phone }
    }).promise()
    console.log(`accountIdMapping for ${phone} query result: ${JSON.stringify(data)}`);
    if ('Item' in data) {
        return data['Item'];
    }
    console.log(`accountIdMapping not found for phone ${phone}`);
    return null;
}

const deactivateUserAccount = async (oldId) => {
    await ddbDocClient.update({
        TableName: constants.accountTable,
        Key: {'id': oldId},
        UpdateExpression: "set currentActive = :currentActive",
        ExpressionAttributeValues: {
            ':currentActive': false
        },
    }).promise()
}

const getUserAccount = async (id) => {
    const res = await ddbDocClient.get({
        TableName: constants.accountTable,
        Key: {id},
    }).promise();
    if ('Item' in res) {
        return res['Item'];
    }
    return null;
}

const getUserAccountByPhone = async (phone) => {
    const mapping = await ddbDocClient.get({
        TableName: constants.userAccountIdMappingTable,
        Key: { phone }
    }).promise()
    if (mapping && 'Item' in mapping) {
        return await getUserAccount(mapping.Item.id);
    }
    return null
}

const addNewUserAccountRecord = async (data) => {
    await ddbDocClient.put({
        TableName: constants.accountTable,
        Item: {...data, 'currentActive': true, createdAt: Date.now()},
    }).promise();
}

const updateUserAccountIdMapping = async (phone, newId) => {
    await ddbDocClient.update({
        TableName: constants.userAccountIdMappingTable,
        Key: { 'phone': phone },
        UpdateExpression: 'set id = :id',
        ExpressionAttributeValues: {
            ':id': newId
        }
    }).promise()
}

const addNewUserAccountIdMapping = async (phone, newId) => {
    await ddbDocClient.put({
        TableName: constants.userAccountIdMappingTable,
        Item: {
            'phone': phone,
            'id': newId
        }
    }).promise()
}

const getTxn = async (txnId) => {
    const res = await ddbDocClient.get({
        TableName: constants.txnTable,
        Key: {txnId}}).promise()
    if ('Item' in res) {
        return res
    }
    return null
}


const addNewTxn = async (Item) => {
    await writeToDb(constants.txnTable, Item);
}

// searches for 1 account
const findHumanForDeposit = async (howMuch, location) => {
    const params = {
        TableName: constants.accountTable,
        FilterExpression: "balance >= :balance AND loc = :loc",
        ExpressionAttributeValues: {
            ":balance": howMuch,
            ":loc": location
        }
    }
    let res = await ddbDocClient.scan(params).promise()
    let account;
    if (res.Items.length === 0 && res.LastEvaluatedKey && 'id' in res.LastEvaluatedKey) {
        while (res.Items.length === 0 && res.LastEvaluatedKey && 'id' in res.LastEvaluatedKey) {
            res = await ddbDocClient.scan({...params, ExclusiveStartKey: res.LastEvaluatedKey}).promise()
            if (res.Items.length > 0) {
                account = res.Items[0];
            }
            if (!res.LastEvaluatedKey || !('id' in res.LastEvaluatedKey)) {
                break
            }
        }
    }
    return account;
}

// searches for 1 account
const findHumanAtLocation = async (location) => {
    const params = {
        TableName: constants.accountTable,
        FilterExpression: "loc = :loc",
        ExpressionAttributeValues: {
            ":loc": location
        }
    }
    let res = await ddbDocClient.scan(params).promise()
    let account;
    if (res.Items.length === 0 && res.LastEvaluatedKey && 'id' in res.LastEvaluatedKey) {
        while (res.Items.length === 0 && res.LastEvaluatedKey && 'id' in res.LastEvaluatedKey) {
            res = await ddbDocClient.scan({...params, ExclusiveStartKey: res.LastEvaluatedKey}).promise()
            if (res.Items.length > 0) {
                account = res.Items[0];
            }
            if (!res.LastEvaluatedKey || !('id' in res.LastEvaluatedKey)) {
                break
            }
        }
    }
    return account;
}

const findFloatingRequest = async (phone) => {
    const res = await ddbDocClient.get({
        TableName: constants.floatingTable,
        Key: {phone}
    }).promise();
    if ('Item' in res) {
        return res['Item'];
    }
    return null;

}

const getUserRequestById = async (id) => {
    const res = await ddbDocClient.get({
        TableName: constants.requestTable,
        Key: { id }
    }).promise();
    if ('Item' in res) {
        return res['Item'];
    }
    return null;
}

const updateTxnStatusToSuccess = async (txnId) => {
    const txn = await getTxn(txnId)
    if (txn) {
        await ddbDocClient.update({
            TableName: constants.txnTable,
            Key: {txnId},
            UpdateExpression: "set status = :status",
            ExpressionAttributeValues: {
                ':status': constants.txnStatus.success
            }
        }).promise()
        console.log(`txn ${txnId} status updated to success`)
    }
}

const createTxn = async (firstParty,
                         secondParty,
                         requestType,
                         howMuch,
                         sendTxnIdTo,
                         sendOtpTo) => {

    // create new txn & save in db
    const txnId = generateUniqueId(constants.txnUidSize, (id) => getTxn(id) === null)
    await addNewTxn({
        'txnId': txnId,
        'firstParty': firstParty,
        'secondParty': secondParty,
        'requestType': constants.requestType.deposit,
        'money': howMuch,
        'status': constants.txnStatus.created,
        'createdAt': Date.now(),
        'currentActive':  true,
    });
    console.log(`created new txn ${txnId} between ${firstParty} & ${secondParty} for ${howMuch} type ${requestType}`)
    // send txn id to
    await sendSms(sendTxnIdTo.toPhoneNumber(), txnId)
    // generate otp
    const otp = generateOtp()
    const key = constructCacheKeyForOtp(txnId)
    // save otp in cache
    await cache.set(key, otp, {EX: constants.otpExpiryInSeconds}).then(_ => {
        console.log(`cache set for key ${key}`);
    });
    // send otp to
    await sendSms(sendOtpTo.toPhoneNumber(), otp)
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

const getBucket = async (phoneWithBucketName) => {
    const res = await ddbDocClient.get({
        TableName: constants.bucketTable,
        Key: { phoneWithBucketName }
    }).promise()
    if ('Item' in res) {
        return res['Item'];
    }
    return null;
}

const getBucketBalance = async (phone, bucketName) => {
    const res = await getBucket(constructUserBucketKey(phone, bucketName));
    if (res && 'balance' in res) {
        return res.balance;
    }
    return null;
}

const constructUserBucketKey = (phone, bucketName) => `${phone.toPhoneNumberDbKey()}:${bucketName}`;

const updateBucket = async (phone, bucketName, howMuch) => {
    const existing = await getBucket(constructUserBucketKey(phone, bucketName))
    await writeToDb(constants.bucketTable, {
        phoneWithBucketName: constructUserBucketKey(phone, bucketName),
        balance: existing ? existing.balance + howMuch : howMuch
    });
};

const getCachedOtpForTxn = async (txnId) => {
    const key = constructCacheKeyForOtp(txnId);
    return await cache.get(key)
}

module.exports = {
    getCachedOtpForTxn,
    getBucketBalance,
    updateBucket,
    getBucket,
    getUserAccountByPhone,
    addLedgerEntry,
    createTxn,
    updateTxnStatusToSuccess,
    getUserRequestById,
    findFloatingRequest,
    findHumanAtLocation,
    findHumanForDeposit,
    getAccountIdMapping,
    deactivateUserAccount,
    getUserAccount,
    addNewUserAccountRecord,
    updateUserAccountIdMapping,
    getTxn,
    addNewTxn,
    addNewUserAccountIdMapping
}