const constants = require('./constants');
const {randomUUID} = require("crypto");
const {
    ddbDocClient,
    sqs,
    QueueUrl
} = require("./clients.js");

const random = (min, max) => Math.floor(Math.random() * (max - min)) + min;

const generateId = (size, symbls = constants.symbols) => {
    let res = '';
    for (let i = 0; i < size; i++) {
        res += symbls[random(0, symbls.length - 1)]
    }
    console.log(`generated id: ${res}`);
    return res;
}

const generateOtp = () => generateId(constants.otpLen, constants.digits);
const constructCacheKeyForOtp = (txnId) => `txnOtp:${txnId}`

const generateUniqueId = (size = constants.txnUidSize, isUniqueCallback) => {
    let id = generateId(size)
    if (!isUniqueCallback(id)) {
        console.log(`generated id ${id} is not unique`);
        id  = generateId(size)
        let uniq = isUniqueCallback(id);
        let attempt = 1;
        while (!uniq && attempt <= constants.txnUidRetryAttempts) {
            console.log(`retry generate unique id attempt: ${attempt}`);
            id = generateId()
            uniq = isUniqueCallback(id)
            attempt++;
        }
        console.log(`failed to generate id after 10 attempts`)
    }  else {
        return id
    }
}

const writeToDb = async (TableName, Item) => {
    await ddbDocClient.put({TableName, Item,}).promise();
    console.log(`Item written to db: ${JSON.stringify(Item)}`);
}

String.prototype.toPhoneNumber = () => '+91' + this.slice(-10);

const sendSms = (to, message) => {
    // todo: implement api call to send sms
}

const deleteReadMessage = async (records) => {
    const Entries = records.map(record => ({Id: randomUUID(), ReceiptHandle: record['receiptHandle']}));
    console.log(`batch delete messages, entries: ${JSON.stringify(Entries)}`);
    await sqs.deleteMessageBatch({QueueUrl, Entries}).promise();
}

const publishMessage = async (MessageBody) => {
    console.log(`will send message: ${MessageBody} to queue ${QueueUrl}`);
    const r = await sqs.sendMessage({
        MessageDeduplicationId: randomUUID(),  // Required for FIFO queues
        MessageGroupId: "Group1",  // Required for FIFO queues
        MessageBody, // string
        QueueUrl
    }).promise()
    console.log(`SQS message sent, id: ${r.MessageId}`);
}


module.exports = {
    generateOtp,
    constructCacheKeyForOtp,
    generateUniqueId,
    writeToDb,
    sendSms,
    deleteReadMessage,
    publishMessage
}
