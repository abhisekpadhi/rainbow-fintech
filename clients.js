const AWS = require('aws-sdk');
const {createClient} = require('redis');

AWS.config.update({
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
});
const sqs = new AWS.SQS({apiVersion: '2012-11-05'});
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const ddbDocumentClient = new AWS.DynamoDB.DocumentClient({apiVersion: "2012-08-10"})
const cache = createClient({url: process.env.REDIS_ENDPOINT});
const QueueUrl = process.env.QUEUE_URL;

module.exports = {sqs, ddb, ddbDocClient: ddbDocumentClient, cache, QueueUrl}
