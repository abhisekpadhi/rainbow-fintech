const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const client = require('twilio')(accountSid, authToken)

const from = process.env.TWILIO_FROM;

//Ex: to:+91876543210
async function twilioSendSms(body: string, to: string) {
    const resp = await client.messages.create({body, from, to});
    console.log(`twilio resp: ${JSON.stringify(resp)}`);
}

module.exports = { twilioSendSms }
