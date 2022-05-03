const constants = require('./constants');
const {randomUUID} = require("crypto");
const {
    ddbDocClient,
    sqs,
    QueueUrl
} = require("./clients.js");
const {twilioSendSms} = require("./sms");

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

const generateUniqueId = async (size = constants.txnUidSize, isUniqueCallback) => {
    let id = generateId(size)
    if (!await isUniqueCallback(id)) {
        console.log(`generated id ${id} is not unique`);
        id  = generateId(size)
        let uniq = await isUniqueCallback(id);
        let attempt = 1;
        while (!uniq && attempt <= constants.txnUidRetryAttempts) {
            console.log(`retry generate unique id attempt: ${attempt}`);
            id = generateId()
            uniq = await isUniqueCallback(id)
            attempt++;
        }
        console.log(`failed to generate id after 10 attempts`)
    }  else {
        return id
    }
}

const writeToDb = async (TableName, Item) => {
    await ddbDocClient.put({TableName, Item}).promise();
    console.log(`Item written to db: ${JSON.stringify(Item)}`);
}

Object.assign(String.prototype, {
    toPhoneNumber() {
        return '+91' + this.slice(-10);
    }
});

Object.assign(String.prototype, {
    toPhoneNumberDbKey() {
        return '91' + this.slice(-10);
    }
});

const sendSms = async (to, message) => {
    try {
        console.log(`sending sms to: ${to} | text: ${message}`);
        // await twilioSendSms(message, to.toPhoneNumber());
    } catch (e) {
        console.log(`failed to send sms, err: ${e}`);
    }

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

exports.String = String;

module.exports = {
    generateOtp,
    constructCacheKeyForOtp,
    generateUniqueId,
    writeToDb,
    sendSms,
    deleteReadMessage,
    publishMessage
}
