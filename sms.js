const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const client = require('twilio')(accountSid, authToken)

const from = process.env.TWILIO_FROM;

//Ex: to:+91876543210
async function twilioSendSms(body, to) {
    const resp = await client.messages.create({body, from, to});
    console.log(`twilio resp: ${JSON.stringify(resp)}`);
}

async function gupshupSendSms(body, to) {
    console.log(`gupshup not implemented, body: ${body}, to: ${to}`);
    // const resp = await client.messages.create({body, from, to});
    // console.log(`twilio resp: ${JSON.stringify(resp)}`);
}

module.exports = { twilioSendSms, gupshupSendSms }
