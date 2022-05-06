const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const client = require('twilio')(accountSid, authToken)
const { randomUUID } = require('crypto');

const from = process.env.TWILIO_FROM;

//Ex: to:+91876543210
async function twilioSendSms(body, to) {
    const resp = await client.messages.create({body, from, to});
    console.log(`twilio resp: ${JSON.stringify(resp)}`);
}

async function gupshupSendSms(body, to) {
    console.log(`gupshup not implemented, body: ${body}, to: ${to}`);
    // todo: implement api call to send message
    // const resp = ...fetchApiCall
    // console.log(`gupshup resp: ${JSON.stringify(resp)}`);
}

async function pushbulletSendSms(body, to) {
    const url = 'https://api.pushbullet.com/v2/texts';
    const headers = {'Access-Token': process.env.PUSHBULLET_ACCESS_TOKEN, 'Content-Type': 'application/json'};
    const payload = {
        "data": {
            "addresses": [to],
            "message": body,
            "target_device_iden": process.env.PUSHBULLET_TARGET_DEVICE_IDEN,
            "guid": randomUUID(),
        }
    }
    const params = {
        method: 'POST',
        body: JSON.stringify(payload),
        headers,
    }
    const resp = await fetch(url, params);
    const result = await resp.json();
    console.log(`pushbullet sms result: ${JSON.stringify(result)}`);
}

module.exports = {
    twilioSendSms,
    gupshupSendSms,
    pushbulletSendSms
}
