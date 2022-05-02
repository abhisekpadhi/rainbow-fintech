const AWS = require('aws-sdk');
const { randomUUID } = require('crypto');
const { createClient } = require('redis');
const constants = require('./constants');

AWS.config.update({region: 'ap-south-1', credentials: {accessKeyId: 'AKIAXYDVU3NFEEK6ET52', secretAccessKey: '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'}});
const test = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const ddbDocClient = new AWS.DynamoDB.DocumentClient({apiVersion: "2012-08-10"})

const ddbScanExample = () => {
    const params = {
        TableName: 'userAccount',
        Limit: 2,
        FilterExpression: "balance >= :balance AND loc = :loc",
        ExpressionAttributeValues: {
            ":balance": {N: '990'},
            ":loc": {S: 'delhi'}
        }
    }

    test.scan(params).promise().then((res) => {
        console.log(`scan res: ${JSON.stringify(res['Items'])}`);
    })
}

const scanExample = () => {
    const scanParams = {
        TableName: 'userAccount',
        Limit: 1,
        FilterExpression: "balance >= :balance AND loc = :loc",
        ExpressionAttributeValues: {
            ":balance": 990,
            ":loc": 'delhi',
        }
    }

    ddbDocClient.scan(scanParams).promise().then((res) => {
        console.log(`scan res: ${JSON.stringify(res['Items'])}`);
    })

}


const queryExample = async () => {
    console.log(`constants acc tbl: ${constants.accountTable}`);
    const res = await ddbDocClient.query({
        TableName: 'userAccountIdMapping',
        Limit: 1,
        KeyConditionExpression: "phone = :phone",
        ExpressionAttributeValues: {
            ':phone': '111'
        }
    }).promise()
    console.log(`query res: ${JSON.stringify(res['Items'])}`);
}

async function fn() {
    const cache = createClient();
    await cache.connect();
    await cache.set('foo123', 'bar321', {EX: 10000});
    const res = await cache.get('foo123');
    console.log(`res = ${res}`);
}

// fn().then(_ => {
//     process.exit(0);
// });


async function updateItem(phone, money) {
    // find the phone to id mapping
    const accountIdMapping = await ddbDocClient.query({
        TableName: 'userAccountIdMapping',
        Limit: 1,
        KeyConditionExpression: "phone = :phone",
        ExpressionAttributeValues: {
            ':phone': phone
        }
    }).promise()
    console.log(`searched first res: ${JSON.stringify(accountIdMapping['Items'])}`);
    if (accountIdMapping['Items'].length === 0) {
        console.log(`accountIdMapping not found for phone ${phone}`)
        return
    }

    const accountMapping = accountIdMapping['Items'][0]
    const oldId = accountMapping['id']
    console.log(`account found: ${JSON.stringify(accountMapping)}`);
    // deactivate old userAccount
    await ddbDocClient.update({
        TableName: 'userAccount',
        Key: {'id': accountMapping['id']},
        UpdateExpression: "set currentActive = :currentActive",
        ExpressionAttributeValues: {
            ':currentActive': false
        },
    }).promise()
    console.log(`old record deactivated`);
    const newId = randomUUID()
    // fetch old userAccount data
    const oldDataResult = await ddbDocClient.query({
        TableName: 'userAccount',
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: {
            ':id': oldId
        }
    }).promise();
    const oldData = oldDataResult.Items[0];
    console.log(`oldData: ${JSON.stringify(oldData)}`)
    // write new userAccount data
    await ddbDocClient.put({
        TableName: 'userAccount',
        Item: {...oldData, 'balance': money, 'currentActive': true, id: newId, createdAt: Date.now()},
    }).promise();
    console.log(`new userAccount record added with id ${newId}`);
    // update phone to id mapping
    await ddbDocClient.update({
        TableName: 'userAccountIdMapping',
        Key: { 'phone': accountMapping['phone'] },
        UpdateExpression: 'set id = :id',
        ExpressionAttributeValues: {
            ':id': newId
        }
    }).promise()
    console.log(`accountIdMapping updated for phone ${phone} to ${newId}`);
}

// updateItem('111', 1650).then(process.exit)

queryExample().then(process.exit);
