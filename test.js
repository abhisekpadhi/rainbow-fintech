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

async function sendSms() {
    const apiUrl = "https://api.checkmobi.com/v1/sms/send";
    const headers = {'Content-Type': 'application/json', 'Authorization': '213C4E58-04D0-4C18-9E9A-A669C8B37BD1'};
    const json = { to: '+919439831236', text: 'PRATIK 987654231'}

    console.log(body);
}

const fetch = require('node-fetch');

async function vonSend() {
    const from = "Vonage APIs"
    const to = "919439831236"
    const text = 'SANDIP 9876543210'
    const apiUrl = 'https://rest.nexmo.com/sms/json';
    const api_key = "283630a8";
    const api_secret = "PGq4DZq3tGqE4z5p";
    const json = {to, from ,text, api_key, api_secret}

    const myHeaders = {"Content-Type": "application/x-www-form-urlencoded"};

    const urlencoded = new URLSearchParams();
    urlencoded.append("from", from);
    urlencoded.append("to", to);
    urlencoded.append("text", text);
    urlencoded.append("api_key", api_key);
    urlencoded.append("api_secret", api_secret);

    const requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: urlencoded,
        redirect: 'follow'
    };

    const res = await fetch(apiUrl, requestOptions)
    const data = await res.json();
    console.log(`vonage resp: ${JSON.stringify(data)}`);
}

// vonSend().then(process.exit)

const accountSid = 'ACf37cc06ababa04e584dddca66c334b3b'
const authToken = '68b583a9bea130eb636a4f3f16833a12'
const twPhone = '+19705192728';
const client = require('twilio')(accountSid, authToken);

async function twSend() {
    const res = await client.messages
        .create({
            body: 'TOTAL 4600',
            from: twPhone,
            to: '+919439831236'
        })
    console.log(`twilio resp: ${JSON.stringify(res)}`);
}

// twSend().then(process.exit);


async function search() {
    const params = {
        TableName: 'userAccount',
        Limit: 1,
        FilterExpression: "loc = :loc",
        ExpressionAttributeValues: {
            ':loc': 'HSR'
        }
    }
    let res = await ddbDocClient.scan(params).promise()
    console.log(`res: ${JSON.stringify(res)}`)
    let account;
    if (res.Items.length === 0 && res.LastEvaluatedKey && 'id' in res.LastEvaluatedKey) {
        while (res.Items.length === 0 && res.LastEvaluatedKey && 'id' in res.LastEvaluatedKey) {
            res = await ddbDocClient.scan({...params, ExclusiveStartKey: res.LastEvaluatedKey}).promise()
            console.log(`res: ${JSON.stringify(res)}`)
            if (res.Items.length > 0) {
                account = res.Items[0];
            }
            if (!res.LastEvaluatedKey || !('id' in res.LastEvaluatedKey)) {
                break
            }
        }
    }

    console.log(`found: ${JSON.stringify(account)}`);
}

// search().then(process.exit)






