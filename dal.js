const {ddbDocClient} = require('./clients');
const constants = require('./constants');
const {writeToDb} = require('./utils');

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
    const res = await ddbDocClient.query({
        TableName: 'userAccount',
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: {
            ':id': id
        }
    }).promise();
    if (res['Items'].length === 0) {
        console.log(`getUserAccount not found for id ${id}`)
        return null
    } else {
        return res['Items'][0]
    }
}

const addNewUserAccountRecord = async (data) => {
    await ddbDocClient.put({
        TableName: 'userAccount',
        Item: {...data, 'currentActive': true, createdAt: Date.now()},
    }).promise();
}

const updateUserAccountIdMapping = async (phone, newId) => {
    await ddbDocClient.update({
        TableName: 'userAccountIdMapping',
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
    const queryParams = {
        TableName: constants.txnTable,
        Limit: 1,
        KeyConditionExpression: "txnId = :txnId",
        ExpressionAttributeValues: {
            ':txnId': txnId
        }
    }

    const res = await ddbDocClient.query(queryParams).promise()
    if (res['Items'].length === 0) {
        console.log(`txn not found for id ${txnId}`)
        return null
    } else {
        return res['Items'][0]
    }
}

const addNewTxn = async (Item) => {
    await writeToDb(constants.txnTable, Item);
}

module.exports = {
    getAccountIdMapping,
    deactivateUserAccount,
    getUserAccount,
    addNewUserAccountRecord,
    updateUserAccountIdMapping,
    getTxn,
    addNewTxn,
    addNewUserAccountIdMapping
}
